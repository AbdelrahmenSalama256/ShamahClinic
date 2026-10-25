'use client';

/**
 * The SEO panel inside one entity page. It is the center's own fields, not a second
 * implementation: the same title, description, counters and save-on-blur, with the row's
 * own inherited copy as the placeholder.
 *
 * The values here are the *published* page's words plus any override. Editing a draft in
 * the pane beside this one does not change them until the draft is published — which is
 * the honest answer, because a crawler reads the published site, not the editor.
 */
import { Card, Note } from './kit';
import { SeoFields } from './SeoFields';
import type { MessageKey } from '@/lib/console/messages';
import type { ContentLocale } from '@/lib/content/kinds';
import type { SeoOverride } from '@/lib/content/seo';

export interface SeoPanelProps {
  path: string | null;
  locale: ContentLocale;
  inherited: SeoOverride;
  override: SeoOverride | null;
  writable: boolean;
  labels: Record<MessageKey, string>;
  rowLabel: string;
}

export function SeoPanel({ path, locale, inherited, override, writable, labels, rowLabel }: Readonly<SeoPanelProps>) {
  return (
    <Card as="section" className="console-panel console-seo-edit">
      <h3>{labels['content.seo']}</h3>
      {path === null ? (
        <Note>{labels['seo.no_page']}</Note>
      ) : (
        <>
          <p className="console-seo-path">{path || '/'}</p>
          <SeoFields
            key={`${path}:${locale}`}
            path={path}
            locale={locale}
            inherited={inherited}
            initial={override}
            writable={writable}
            labels={labels}
            rowLabel={rowLabel}
            variant="panel"
          />
        </>
      )}
    </Card>
  );
}
