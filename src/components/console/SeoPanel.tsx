'use client';

/**
 * The SEO panel inside one entity page: the full SEO box — focus keyword and score,
 * result preview, share card, canonical and noindex — over the same per-address record
 * the SEO center edits, with the row's own inherited copy as the placeholder.
 *
 * The inherited values are the *published* page's words. The score reads the draft body in
 * the editor beside it, so a person sees the grade move as they write; the result title and
 * description it grades are the ones a crawler gets once the draft is published.
 */
import { Card, Note } from './kit';
import { SeoBox } from './SeoBox';
import type { MessageKey } from '@/lib/console/messages';
import type { ContentLocale } from '@/lib/content/kinds';
import { localizedPath } from '@/lib/content/paths';
import type { SeoOverride } from '@/lib/content/seo';
import { siteConfig } from '@/config/site';

export interface SeoPanelProps {
  path: string | null;
  locale: ContentLocale;
  inherited: SeoOverride;
  override: SeoOverride | null;
  writable: boolean;
  labels: Record<MessageKey, string>;
  rowLabel: string;
  /** The draft body in the editor, for the score's content checks. */
  body?: string | null;
  image?: string | null;
}

export function SeoPanel({ path, locale, inherited, override, writable, labels, body = null, image = null }: Readonly<SeoPanelProps>) {
  return (
    <Card as="section" className="console-panel console-seo-edit">
      <h3>{labels['content.seo']}</h3>
      {path === null ? (
        <Note>{labels['seo.no_page']}</Note>
      ) : (
        <>
          <p className="console-seo-path">{path || '/'}</p>
          <SeoBox
            key={`${path}:${locale}`}
            path={path}
            href={`${siteConfig.siteUrl}${localizedPath(path, locale)}`}
            locale={locale}
            inherited={inherited}
            initial={override}
            writable={writable}
            labels={labels}
            body={body}
            image={image}
          />
        </>
      )}
    </Card>
  );
}
