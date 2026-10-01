/**
 * Central Image Map for Shamah Clinics
 * All components MUST import images from this file rather than referencing paths directly.
 * When real photos become available, updating this single file will reflect across the site.
 */

  export const images = {
  logo: "/images/logo.png",
  hero: {
    bg: "/images/hero-bg.svg",
    portrait: "/images/hero-portrait.svg",
  },
  treatments: {
    laser: "/images/treatment-laser.svg",
    skincare: "/images/treatment-skincare.svg",
    injectables: "/images/treatment-injectables.svg",
    peel: "/images/treatment-peel.svg",
    hydra: "/images/treatment-hydra.svg",
    tightening: "/images/treatment-tightening.svg",
    prp: "/images/treatment-skincare.svg",
    yalopro: "/images/treatment-injectables.svg",
    fractional: "/images/treatment-laser.svg",
    botox: "/images/treatment-injectables.svg",
    fillers: "/images/treatment-injectables.svg",
  },
  beforeAfter: {
    skinGlow: {
      before: "/images/before-after-1-before.svg",
      after: "/images/before-after-1-after.svg",
    },
    contour: {
      before: "/images/before-after-1-before.svg",
      after: "/images/before-after-1-after.svg",
    },
  },
  doctors: {
    doctor1: "/images/doctor-1.svg",
    doctor2: "/images/doctor-2.svg",
    doctor3: "/images/doctor-3.svg",
  },
} as const;

export type ImageMap = typeof images;
