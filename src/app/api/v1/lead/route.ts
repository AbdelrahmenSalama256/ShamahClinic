import { NextResponse } from "next/server";
import { CF7_FIELDS, CF7_FORM_ID, LEAD_MODE, WHATSAPP, WP_ORIGIN } from "@/lib/wp/config";

export const runtime = "nodejs";

interface LeadInput {
  name: string;
  phone: string;
  date?: string;
  service?: string;
  offer?: string;
  subject?: string;
  branch?: string;
  message?: string;
  lang?: string;
  _website?: string; // honeypot
}

// --- basic in-memory rate limit (per server instance) ---------------------
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 6;
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > WINDOW_MS) hits.delete(k);
  }
  return list.length > MAX_PER_WINDOW;
}

function buildMessage(input: LeadInput): string {
  const lines = [
    `New booking request — Shamah Clinics`,
    `Name: ${input.name}`,
    `Phone: ${input.phone}`,
  ];
  if (input.date) lines.push(`Preferred date: ${input.date}`);
  if (input.service) lines.push(`Service: ${input.service}`);
  if (input.offer) lines.push(`Offer: ${input.offer}`);
  if (input.branch) lines.push(`Branch: ${input.branch}`);
  if (input.subject) lines.push(`Subject: ${input.subject}`);
  if (input.message) lines.push(`Message: ${input.message}`);
  return lines.join("\n");
}

/** A client-facing WhatsApp message in the visitor's language (whatsapp lead mode). */
function buildWhatsAppMessage(input: LeadInput): string {
  const ar = input.lang !== "en";
  if (ar) {
    const lines = ["مرحباً عيادات شامه، أرغب في حجز موعد.", `• الاسم: ${input.name}`, `• الهاتف: ${input.phone}`];
    if (input.service) lines.push(`• الخدمة: ${input.service}`);
    if (input.offer) lines.push(`• العرض: ${input.offer}`);
    if (input.branch) lines.push(`• الفرع: ${input.branch}`);
    if (input.date) lines.push(`• التاريخ المفضل: ${input.date}`);
    if (input.message) lines.push(`• ملاحظة: ${input.message}`);
    lines.push("أرجو تأكيد الموعد. شكراً لكم!");
    return lines.join("\n");
  }
  const lines = ["Hello Shamah Clinics, I would like to book an appointment.", `• Name: ${input.name}`, `• Phone: ${input.phone}`];
  if (input.service) lines.push(`• Service: ${input.service}`);
  if (input.offer) lines.push(`• Offer: ${input.offer}`);
  if (input.branch) lines.push(`• Branch: ${input.branch}`);
  if (input.date) lines.push(`• Preferred date: ${input.date}`);
  if (input.message) lines.push(`• Note: ${input.message}`);
  lines.push("Please confirm my appointment. Thank you!");
  return lines.join("\n");
}

function invalid(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function POST(req: Request) {
  let input: LeadInput;
  try {
    input = (await req.json()) as LeadInput;
  } catch {
    return invalid("Invalid JSON body");
  }

  // Honeypot: silently accept and drop bot submissions.
  if (input._website) {
    return NextResponse.json({ ok: true, mode: LEAD_MODE }, { status: 200 });
  }

  const name = (input.name || "").trim();
  const phone = (input.phone || "").trim();
  if (name.length < 2) return invalid("Please enter your name");
  if (!/^[+()\d\s-]{7,20}$/.test(phone)) return invalid("Please enter a valid phone number");

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: "Too many requests, please try again shortly." }, { status: 429 });
  }

  const message = buildMessage({ ...input, name, phone });

  // Default mode: hand the user a prefilled WhatsApp deep link (no email sent).
  if (LEAD_MODE === "whatsapp") {
    const waText = buildWhatsAppMessage({ ...input, name, phone });
    const waUrl = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(waText)}`;
    return NextResponse.json({ ok: true, mode: "whatsapp", whatsappUrl: waUrl, message: waText });
  }

  // CF7 mode: forward to the real contact form (emails the clinic).
  try {
    const form = new URLSearchParams();
    form.set(CF7_FIELDS.name, name);
    form.set(CF7_FIELDS.phone, phone);
    if (input.date) form.set(CF7_FIELDS.date, input.date);
    form.set(CF7_FIELDS.subject, [input.service, input.offer, input.subject].filter(Boolean).join(" — ") || message.slice(0, 80));
    // The CF7 form has no branch field, so the chosen branch travels in textarea-1.
    form.set(
      CF7_FIELDS.message,
      [input.message?.trim(), input.branch ? `Branch: ${input.branch}` : "", input.date ? `Preferred date: ${input.date}` : ""]
        .filter(Boolean)
        .join("\n") || message,
    );
    form.set("_wpcf7", String(CF7_FORM_ID));
    form.set("_wpcf7_version", "0");
    form.set("_wpcf7_locale", "en_US");
    form.set("_wpcf7_unit_tag", `wpcf7-f${CF7_FORM_ID}`);

    const res = await fetch(`${WP_ORIGIN}/wp-json/contact-form-7/v1/contact-forms/${CF7_FORM_ID}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ ok: false, mode: "cf7", error: "form_rejected", detail: data }, { status: 502 });
    }
    return NextResponse.json({ ok: true, mode: "cf7", detail: data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, mode: "cf7", error: e instanceof Error ? e.message : "cf7 unavailable" },
      { status: 502 },
    );
  }
}
