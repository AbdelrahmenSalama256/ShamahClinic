"use client";

import React, { createContext, useContext } from "react";
import type { ClinicWords } from "@/lib/content/site";
import { clinicData } from "@/data/clinic";
import { BRAND_DEFAULTS } from "@/lib/content/brand-shape";
import { PROMO_DEFAULTS } from "@/lib/content/promo-shape";

/**
 * The phone number, the WhatsApp number and the link built from it — read once per
 * page render on the server, from the rows Settings writes.
 *
 * Every control that dials or opens WhatsApp is a client component, so the words have to
 * cross that boundary exactly once rather than in eight separate `useEffect` fetches. The
 * default is the number shipped in `config/site.ts`, which is what these controls rendered
 * before this provider existed: a page whose database is unreachable, or a control
 * rendered above the site layout, still shows a real number instead of an empty `tel:`
 * link.
 */
const fallback: ClinicWords = {
  phone: clinicData.phone,
  whatsapp: clinicData.whatsapp,
  whatsappUrl: clinicData.whatsappUrl,
  brand: BRAND_DEFAULTS,
  promo: PROMO_DEFAULTS,
};

const ClinicContext = createContext<ClinicWords>(fallback);

export function ClinicProvider({
  value,
  children,
}: Readonly<{ value: ClinicWords; children: React.ReactNode }>) {
  return <ClinicContext.Provider value={value}>{children}</ClinicContext.Provider>;
}

export function useClinic(): ClinicWords {
  return useContext(ClinicContext);
}
