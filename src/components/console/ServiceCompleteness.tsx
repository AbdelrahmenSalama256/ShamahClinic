'use client';

/**
 * How much of this service page the site would actually show.
 *
 * The thirteen rules live in `service-doc.ts` and are the only place the question is
 * answered, so the meter, the list's warning badges and the public page cannot each decide
 * for themselves what "has a FAQ" means. It reads the *live form* the way the preview does:
 * a sentence typed but not yet saved already counts, and a section the row only inherits a
 * default for never does.
 *
 * It is a number an owner can act on and nothing else. No save waits for it, no publish is
 * stopped by it, and an old row written before these fields existed opens editable at 7% —
 * because a meter that gated the save button would be the editor telling an owner to throw
 * the row away and start again.
 */
import { serviceCompletenessOfDoc, type ServiceCheckKey } from '@/lib/content/service-doc';
import { Note } from './kit';
import type { MessageKey } from '@/lib/console/messages';

export function ServiceCompleteness({
  doc,
  rowKey,
  labels,
}: Readonly<{
  /** the document the form holds right now, exactly as the save would write it */
  doc: Record<string, unknown>;
  rowKey: string;
  labels: Record<MessageKey, string>;
}>) {
  const meter = serviceCompletenessOfDoc(doc, rowKey);
  const line = labels['content.service.meter.score']
    .replace('{pct}', String(meter.score))
    .replace('{done}', String(meter.done.length))
    .replace('{total}', String(meter.total));
  const todo = (key: ServiceCheckKey): string => labels[`content.service.todo.${key}` as MessageKey];

  return (
    <section className="console-meter" aria-label={labels['content.service.meter']}>
      <h3>{labels['content.service.meter']}</h3>
      <p className="console-meter-line">{line}</p>
      {/* The sentence says the number, so the bar is decoration for the eye, not a second
          announcement for the voice. */}
      <span aria-hidden="true" className="console-meter-bar">
        <span className="console-meter-fill" style={{ inlineSize: `${meter.score}%` }} />
      </span>
      {meter.missing.length === 0 ? (
        <Note>{labels['content.service.meter.done']}</Note>
      ) : (
        <>
          {meter.missingCore.length > 0 && (
            <div className="console-meter-part is-core">
              <span className="console-meter-part-name">{labels['content.service.meter.core']}</span>
              <ul className="console-meter-chips">
                {meter.missingCore.map((key) => (
                  <li key={key}>{todo(key)}</li>
                ))}
              </ul>
            </div>
          )}
          {meter.missingOptional.length > 0 && (
            <div className="console-meter-part">
              <span className="console-meter-part-name">{labels['content.service.meter.optional']}</span>
              <ul className="console-meter-chips">
                {meter.missingOptional.map((key) => (
                  <li key={key}>{todo(key)}</li>
                ))}
              </ul>
            </div>
          )}
          <Note>{labels['content.service.meter.hint']}</Note>
        </>
      )}
    </section>
  );
}
