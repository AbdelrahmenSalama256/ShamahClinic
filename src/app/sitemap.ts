import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { treatmentsData } from "@/data/treatments";
import { branchesData } from "@/data/branches";
import { journalData } from "@/data/journal";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-09-29");

  const staticRoutes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "", priority: 1, changeFrequency: "weekly" },
    { path: "/services", priority: 0.9, changeFrequency: "weekly" },
    { path: "/doctors", priority: 0.8, changeFrequency: "monthly" },
    { path: "/results", priority: 0.7, changeFrequency: "monthly" },
    { path: "/offers", priority: 0.8, changeFrequency: "weekly" },
    { path: "/branches", priority: 0.8, changeFrequency: "monthly" },
    { path: "/blogs", priority: 0.7, changeFrequency: "weekly" },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" },
    { path: "/faq", priority: 0.6, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.9, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  ];

  const entries: MetadataRoute.Sitemap = staticRoutes.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified,
    priority: r.priority,
    changeFrequency: r.changeFrequency,
  }));

  treatmentsData.forEach((t) =>
    entries.push({
      url: `${SITE_URL}/treatments/${t.id}`,
      lastModified,
      priority: 0.8,
      changeFrequency: "monthly",
    })
  );

  branchesData.forEach((b) =>
    entries.push({
      url: `${SITE_URL}/branches/${b.id}`,
      lastModified,
      priority: 0.7,
      changeFrequency: "monthly",
    })
  );

  journalData.forEach((a) =>
    entries.push({
      url: `${SITE_URL}/blogs/${a.slug}`,
      lastModified: new Date(a.isoDate),
      priority: 0.6,
      changeFrequency: "yearly",
    })
  );

  return entries;
}
