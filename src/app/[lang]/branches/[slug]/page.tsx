import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, branchJsonLd } from "@/lib/jsonld";
import { branchesData, getBranch } from "@/data/branches";
import { BranchDetailClient } from "@/components/pages/BranchDetailClient";

interface Props {
  params: Promise<{ lang: string; slug: string }>;
}

export function generateStaticParams() {
  return branchesData.map((b) => ({ slug: b.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const branch = getBranch(slug);
  if (!branch) return {};

  return buildPageMetadata({
    path: `/branches/${branch.id}`,
    title: { ar: `${branch.name.ar} — العنوان والهاتف`, en: branch.name.en },
    description: { ar: branch.intro.ar, en: branch.intro.en },
    image: branch.image.src,
  });
}

export default async function BranchDetailPage({ params }: Props) {
  const { slug } = await params;
  const branch = getBranch(slug);
  if (!branch) notFound();

  return (
    <>
      <JsonLd
        data={[
          await branchJsonLd(branch),
          await breadcrumbJsonLd([
            { name: { ar: "الرئيسية", en: "Home" }, path: "" },
            { name: { ar: "الفروع", en: "Branches" }, path: "/branches" },
            { name: branch.name, path: `/branches/${branch.id}` },
          ]),
        ]}
      />
      <BranchDetailClient branch={branch} />
    </>
  );
}
