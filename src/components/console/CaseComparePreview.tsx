'use client';

import { ChevronsLeftRight } from 'lucide-react';
import { Card, Note } from './kit';
import { frameGeometry, useCompareSlider } from '@/components/ui/compare-slider';
import type { ResultCasePreview } from '@/lib/console/preview';
import type { ContentLocale } from '@/lib/content/kinds';
import type { MessageKey } from '@/lib/console/messages';

/**
 * The before/after case as the home page will drag it, painted with the console's own sheet.
 *
 * The sandboxed frame beside this one cannot carry the interaction — it runs no scripts, which
 * is what makes it safe to hand it HTML exactly as it was typed. So the comparison is drawn
 * here instead, from the form's two picture paths, over the same files the site loads. What a
 * person drags in this pane is the same divide, in the same reading direction, with the same
 * arrow keys, because `useCompareSlider` is the one implementation both surfaces call.
 *
 * A half case says so rather than drawing a comparison it does not have: with one picture the
 * site shows no slider anywhere, and a preview that offered one would promise a band the
 * homepage will never paint.
 */
export function CaseComparePreview({
  model,
  locale,
  labels,
}: Readonly<{
  model: ResultCasePreview;
  locale: ContentLocale;
  labels: Record<MessageKey, string>;
}>) {
  const rtl = locale === 'ar';
  const slider = useCompareSlider(rtl);
  const geometry = frameGeometry(slider.progress, rtl);
  const both = model.before !== '' && model.after !== '';
  // The same fallback the results page uses for a picture nobody described: the case's own name.
  const altOf = (alt: string): string => (alt.trim() === '' ? model.headline : alt);

  return (
    <Card as="section" className="console-panel">
      <h3>{labels['content.preview.compare']}</h3>
      {both ? (
        <>
          <div {...slider.frameProps} className={`${slider.frameProps.className} console-compare-frame`}>
            {/* The path is whatever the row already carries — an upload, a mirrored WordPress
                file, a data URL from an import — so it cannot be a build-time image host. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="console-compare-img" src={model.after} alt={altOf(model.afterAlt)} decoding="async" />
            <div className="console-compare-clip" style={{ clipPath: geometry.clipPath }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="console-compare-img" src={model.before} alt={altOf(model.beforeAlt)} decoding="async" />
              <span className="console-compare-corner" dir="auto">
                {labels['content.result.before']}
              </span>
            </div>
            <span className="console-compare-corner is-after" dir="auto">
              {labels['content.result.after']}
            </span>
            <span aria-hidden="true" className="console-compare-line" style={geometry.line} />
            <div
              {...slider.handleProps}
              aria-label={labels['content.preview.compare.handle']}
              aria-valuetext={labels['content.preview.compare.value'].replace('{0}', String(slider.percent))}
              className="console-compare-handle"
              style={geometry.handle}
            >
              <ChevronsLeftRight aria-hidden="true" className="console-compare-glyph" />
            </div>
          </div>
          <Note>{labels['content.preview.compare.hint']}</Note>
        </>
      ) : (
        <Note>{labels['content.preview.compare.half']}</Note>
      )}
    </Card>
  );
}
