'use client';

/**
 * The two fields a search result is made of, in one component used by both the SEO
 * center's table and the panel inside an entity page.
 *
 * The stored value is an *override*, never the page's own words: an empty field means
 * "the page keeps its copy", and the input's placeholder is exactly what the site emits
 * today. That is why the same pair of fields can sit beside a 94-row table and in an
 * article's sidebar without either screen duplicating the inheritance rule.
 *
 * Saving happens on blur, not while typing: a title is written once, and a request per
 * keystroke would turn a slow sentence into a queue of writes whose last one may not be
 * the one on screen. The status badge follows the effective value live, so a person sees
 * "too long" before the field is left.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { consoleCall } from './client-api';
import { Badge, Button, Field, Input, Note, Textarea, type Tone } from './kit';
import type { MessageKey } from '@/lib/console/messages';
import type { ContentLocale } from '@/lib/content/kinds';
import type { SeoOverride } from '@/lib/content/seo';
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, seoLength, seoStatus, worstStatus, type SeoStatus } from '@/lib/content/seo-limits';

type Notice = { tone: Tone; key: MessageKey };

export interface SeoFieldsProps {
  /** The public path the record is keyed by; `''` is the home page. */
  path: string;
  locale: ContentLocale;
  /** What the site emits today, with the locale fallback already applied. */
  inherited: SeoOverride;
  initial: SeoOverride | null;
  writable: boolean;
  labels: Record<MessageKey, string>;
  /** The entity's name, so two inputs in a table still have distinct spoken labels. */
  rowLabel: string;
  variant: 'row' | 'panel';
  onStatusChange?: (status: SeoStatus) => void;
}

function statusTone(status: SeoStatus): Tone {
  return status === 'ok' ? 'ok' : status === 'long' ? 'warn' : 'danger';
}

function Meter({ value, max, status, labels }: Readonly<{ value: string; max: number; status: SeoStatus; labels: Record<MessageKey, string> }>) {
  return (
    <span className="console-screen-meter">
      <Badge tone={statusTone(status)}>{labels[`seo.status.${status}` as MessageKey]}</Badge>
      <Note>{labels['seo.count'].replace('{n}', String(seoLength(value))).replace('{max}', String(max))}</Note>
    </span>
  );
}

function errorKey(code: string): MessageKey {
  if (code === 'forbidden') return 'seo.error.forbidden';
  if (code === 'invalid_input') return 'seo.error.invalid_input';
  return 'seo.failed';
}

export function SeoFields({ path, locale, inherited, initial, writable, labels, rowLabel, variant, onStatusChange }: Readonly<SeoFieldsProps>) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [baseline, setBaseline] = useState<SeoOverride | null>(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // The form starts from the server's row and then belongs to the person typing. Both
  // call sites key this component by path and language, so a new address or a new tab
  // remounts it; a refresh that re-reads the same row does not overwrite an edit in
  // progress, the same way the content editor leaves a dirty form alone.

  const effectiveTitle = title.trim() || inherited.title;
  const effectiveDescription = description.trim() || inherited.description;
  const titleStatus = seoStatus(effectiveTitle, SEO_TITLE_MAX);
  const descriptionStatus = seoStatus(effectiveDescription, SEO_DESCRIPTION_MAX);
  const rowStatus = worstStatus(titleStatus, descriptionStatus);

  // The parent keeps the row's status for its filter; a ref keeps that callback out of
  // the effect's dependencies, so a new arrow function each render cannot loop.
  const statusRef = useRef(onStatusChange);
  useEffect(() => {
    statusRef.current = onStatusChange;
  }, [onStatusChange]);
  useEffect(() => {
    statusRef.current?.(rowStatus);
  }, [rowStatus]);

  async function persist(nextTitle: string, nextDescription: string): Promise<void> {
    if (!writable || saving) return;
    const trimmedTitle = nextTitle.trim();
    const trimmedDescription = nextDescription.trim();
    if ((baseline?.title ?? '') === trimmedTitle && (baseline?.description ?? '') === trimmedDescription) return;

    setSaving(true);
    setNotice(null);
    const result = await consoleCall<{ override: SeoOverride | null }>('/api/console/seo', 'POST', {
      path,
      locale,
      title: trimmedTitle,
      description: trimmedDescription,
    });
    setSaving(false);
    if (result.error) {
      setNotice({ tone: 'danger', key: errorKey(result.error) });
      return;
    }
    const saved = result.data?.override ?? null;
    setBaseline(saved);
    setTitle(saved?.title ?? '');
    setDescription(saved?.description ?? '');
    setNotice({ tone: 'ok', key: 'seo.saved' });
  }

  function reset(): void {
    setTitle('');
    setDescription('');
    setNotice(null);
    void persist('', '');
  }

  const shownTitle = writable ? title : title.trim() || inherited.title;
  const shownDescription = writable ? description : description.trim() || inherited.description;
  const canReset = writable && baseline !== null;

  const titleInput = (
    <Input
      id={titleId}
      className="console-screen-input"
      value={shownTitle}
      placeholder={inherited.title || labels['seo.placeholder.title']}
      aria-label={variant === 'row' ? `${labels['seo.column.title']}: ${rowLabel}` : undefined}
      readOnly={!writable}
      disabled={saving}
      maxLength={500}
      onChange={(event) => {
        setTitle(event.target.value);
        setNotice(null);
      }}
      onBlur={() => void persist(title, description)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && writable) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );

  const descriptionInput = (
    <Textarea
      id={descriptionId}
      className="console-screen-input console-screen-textarea"
      rows={variant === 'panel' ? 4 : 2}
      value={shownDescription}
      placeholder={inherited.description || labels['seo.placeholder.description']}
      aria-label={variant === 'row' ? `${labels['seo.column.description']}: ${rowLabel}` : undefined}
      readOnly={!writable}
      disabled={saving}
      maxLength={1000}
      onChange={(event) => {
        setDescription(event.target.value);
        setNotice(null);
      }}
      onBlur={() => void persist(title, description)}
    />
  );

  if (variant === 'panel') {
    return (
      <div className="console-seo-fields">
        <Field label={labels['seo.column.title']} htmlFor={titleId} note={<Meter value={effectiveTitle} max={SEO_TITLE_MAX} status={titleStatus} labels={labels} />}>
          {titleInput}
        </Field>
        <Field
          label={labels['seo.column.description']}
          htmlFor={descriptionId}
          note={<Meter value={effectiveDescription} max={SEO_DESCRIPTION_MAX} status={descriptionStatus} labels={labels} />}
        >
          {descriptionInput}
        </Field>
        <div className="console-seo-actions">
          <Note>{writable ? labels['seo.edit_hint'] : labels['seo.readonly']}</Note>
          {canReset && (
            <Button size="sm" variant="ghost" onClick={reset} disabled={saving}>
              {labels['seo.reset']}
            </Button>
          )}
        </div>
        {notice && (
          <Note tone={notice.tone} className="console-screen-notice">
            {labels[notice.key]}
          </Note>
        )}
      </div>
    );
  }

  return (
    <>
      <td className="console-seo-cell-title">
        {titleInput}
        <Meter value={effectiveTitle} max={SEO_TITLE_MAX} status={titleStatus} labels={labels} />
      </td>
      <td className="console-seo-cell-description">
        {descriptionInput}
        <Meter value={effectiveDescription} max={SEO_DESCRIPTION_MAX} status={descriptionStatus} labels={labels} />
      </td>
      <td className="console-screen-cell-status">
        <Badge tone={statusTone(rowStatus)}>{labels[`seo.status.${rowStatus}` as MessageKey]}</Badge>
        {canReset && (
          <Button size="sm" variant="ghost" onClick={reset} disabled={saving}>
            {labels['seo.reset']}
          </Button>
        )}
        {!writable && <Note>{labels['seo.readonly']}</Note>}
        {notice && (
          <Note tone={notice.tone} className="console-screen-notice">
            {labels[notice.key]}
          </Note>
        )}
      </td>
    </>
  );
}
