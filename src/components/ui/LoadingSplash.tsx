import Image from "next/image";
import { siteConfig } from "@/config/site";

export function LoadingSplash() {
  return (
    <div className="brand-loading-splash" role="status" aria-label="Loading Shamah Clinics" aria-busy="true">
      <span className="brand-loading-splash__spinner" aria-hidden="true" />
      <Image
        src={siteConfig.brand.logo}
        alt="Shamah Clinics"
        width={220}
        height={110}
        priority
        className="brand-loading-splash__logo"
      />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
