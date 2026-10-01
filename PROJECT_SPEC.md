# Shamah Clinics — Website Specification (DESIGN ONLY)

## 0. Scope: design only (frontend only)
- UI/UX only. NO backend, database, authentication, API routes, server actions, email sending, payment logic, or external API calls.
- All forms (booking, contact, newsletter, careers) are visual only: client-side validation and realistic success/error states, nothing is sent or stored.
- Booking flow = complete multi-step UI ending on an animated thank-you/summary page, with a client-side .ics calendar download.
- All content (treatments, specialists, articles, offers, testimonials, branches) lives in typed local data files under src/data, so each new item is a single object.
- Only real actions allowed: tel: links and https://wa.me/201121880908. "Book" buttons open WhatsApp with a prefilled Arabic message.
- Images: no real photos are available yet. Use a central image map (src/data/images.ts) pointing to high-quality SVG/gradient placeholders in /public/images (elegant gold/blush abstract visuals with proper aspect ratios), so real photos can replace them later by changing one file. Never hotlink external images.

## 1. Clinic data (keep in ONE file: src/data/clinic.ts)
- Name: Shamah Clinics / عيادات شامة
- Main phone and WhatsApp: +20 112 188 0908
- Currency: EGP
- Branches (all in Egypt):
  1) Nasr City, Cairo — 8 Mostafa Hemam Street, off Abbas El Akkad, 3rd Floor, behind KFC, above Mastoura Store. Phone 01026788285
  2) New Cairo, Fifth Settlement — Medical Park, behind Air Force Hospital, next to Nasaem Hospital, Clinic 302, 3rd Floor. Phone 01018064881
  3) Sheikh Zayed — Trivium Mall, behind Capital and Park Street, 2nd District, 1st Floor, Clinic 137A. Phone 01121880855
- Working hours: placeholder "Daily 10:00 AM – 10:00 PM" (to be confirmed)
- Email: placeholder info@shamahclinics.com (to be confirmed)
- Services: laser hair removal, skincare, Botox injections, filler injections, chemical peels (yellow peel), Yalo Pro skin-booster injections, fractional laser, HydraFacial, PRP, skin tightening
- All Arabic copy must be natural, professional Arabic (Egyptian-friendly Modern Standard), written by you, not machine-literal.

## 2. Language and typography
- Arabic primary, RTL (dir="rtl", lang="ar"). English toggle (LTR) with Inter, fully mirrored layout.
- Font: Tajawal via next/font/google, weights 300/400/500/700/800, display: swap.
- Locale-aware numerals and dates (Arabic-Indic or Western based on toggle).
- Use logical CSS properties (ms-, me-, ps-, pe-, start/end) so RTL/LTR mirroring works automatically.

## 3. Brand and visual style
- Elegant gold-and-luxury cosmetic clinic identity with a Saudi-inspired luxury feel. NOT a hospital: upscale, spa-like, modern, feminine-friendly, warm and vibrant, never sterile or cold.
- Signature: rich gold gradient (#C9A227 to #8B6914) on buttons, dividers, card borders, hero overlays.
- Supporting palette: soft blush/rose, deep espresso/charcoal for text and dark sections, warm cream/ivory backgrounds (never pure white).
- Rounded corners (xl/2xl), soft shadows, thin-line icons, generous white space, large imagery as the visual anchor.
- Glassmorphism on navbar and floating cards; geometric Islamic pattern accents at low opacity.
- All colors defined as semantic design tokens (CSS variables + Tailwind theme). No hardcoded colors in components.

## 4. Animation and motion (critical)
- Framer Motion + custom CSS keyframes. Must NOT feel static.
- Hero: staggered fade-up text, gold shimmer/glow on primary CTAs, animated gradient or floating sparkles.
- Scroll-reveal on every section (fade-up, slide, scale).
- Keyframes for: pulsing "book now"/offer badges, floating gold sparkles, animated counters, marquee strips.
- Before/after comparison slider with animated drag handle.
- Hover micro-interactions on all cards/buttons (lift + gold glow + scale).
- Off-canvas mobile menu with blurred backdrop, sliding from the correct side in RTL and LTR.
- Navbar shrinks and blurs on scroll. Skeleton shimmer loaders. Smooth route transitions.
- Animate only transform and
