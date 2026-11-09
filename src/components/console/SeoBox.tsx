'use client';

/**
 * The full SEO box inside one entity page: what an SEO plugin gives a post, on top of the
 * SEO center's two fields.
 *
 *   General   focus keyword, result title and description, and a Google result preview
 *   Social    the share card's own title, text and picture, with a preview of the card
 *   Advanced  canonical address and "keep out of search results"
 *
 * Above the tabs sits the score: every check `seo-score.ts` could judge from this page,
 * re-graded as the person types, including the draft body in the editor beside it.
 *
 * Like the center, every field is an override: empty means "the page keeps its own words",
 * and the placeholder is what the site emits today. A field saves when it loses focus; a
 * switch or a new picture saves at once.
 */
import { useId, useMemo, useState, type CSSProperties } from 'react';
import { consoleCall } from './client-api';
import { Badge, Button, Checkbox, Field, Input, Note, Textarea, type Tone } from './kit';
import { Tabs } from './kit-tabs';
import { ImagePicker } from './ImagePicker';
import type { MessageKey } from '@/lib/console/messages';
import type { ContentLocale } from '@/lib/content/kinds';
import type { SeoOverride } from '@/lib/content/seo';
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, seoLength, seoStatus } from '@/lib/content/seo-limits';
import { seoGrade, seoScore } from '@/lib/content/seo-score';

type Tab = 'general' | 'social' | 'advanced';
type Notice = { tone: Tone; key: MessageKey };

interface SeoForm {
  title: string;
  description: string;
  focusKeyword: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  canonical: string;
  noindex: boolean;
}

const EMPTY: SeoForm = { title: '', description: '', focusKeyword: '', ogTitle: '', ogDescription: '', ogImage: '', canonical: '', noindex: false };

function fromOverride(value: SeoOverride | null): SeoForm {
  if (!value) return EMPTY;
  return {
    title: value.title ?? '',
    description: value.description ?? '',
    focusKeyword: value.focusKeyword ?? '',
    ogTitle: value.ogTitle ?? '',
    ogDescription: value.ogDescription ?? '',
    ogImage: value.ogImage ?? '',
    canonical: value.canonical ?? '',
    noindex: !!value.noindex,
  };
}

const same = (a: SeoForm, b: SeoForm) => (Object.keys(EMPTY) as (keyof SeoForm)[]).every((key) => (typeof a[key] === 'string' ? String(a[key]).trim() : a[key]) === (typeof b[key] === 'string' ? String(b[key]).trim() : b[key]));

const GRADE_TONE: Record<'good' | 'fair' | 'poor', Tone> = { good: 'ok', fair: 'warn', poor: 'danger' };

function errorKey(code: string): MessageKey {
  if (code === 'forbidden') return 'seo.error.forbidden';
  if (code === 'invalid_input') return 'seo.error.invalid_input';
  return 'seo.failed';
}

export interface SeoBoxProps {
  path: string;
  /** The public URL with its language segment, for the preview's address line. */
  href: string;
  locale: ContentLocale;
  inherited: SeoOverride;
  initial: SeoOverride | null;
  writable: boolean;
  labels: Record<MessageKey, string>;
  /** The draft body in the editor, or null for a row without one. */
  body: string | null;
  /** The page's own picture, the share card's fallback before the site default. */
  image?: string | null;
}

export function SeoBox({ path, href, locale, inherited, initial, writable, labels, body, image }: Readonly<SeoBoxProps>) {
  const id = useId();
  const [tab, setTab] = useState<Tab>('general');
  const [form, setForm] = useState<SeoForm>(() => fromOverride(initial));
  const [baseline, setBaseline] = useState<SeoForm>(() => fromOverride(initial));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showChecks, setShowChecks] = useState(false);

  const title = form.title.trim() || inherited.title;
  const description = form.description.trim() || inherited.description;
  const shareTitle = form.ogTitle.trim() || title;
  const shareDescription = form.ogDescription.trim() || description;
  const shareImage = form.ogImage.trim() || image || '';

  const score = useMemo(
    () => seoScore({ focusKeyword: form.focusKeyword, title, description, path, body, ogImage: shareImage }),
    [form.focusKeyword, title, description, path, body, shareImage],
  );
  const grade = seoGrade(score.score);

  async function persist(next: SeoForm): Promise<void> {
    if (!writable || saving || same(next, baseline)) return;
    setSaving(true);
    setNotice(null);
    const result = await consoleCall<{ override: SeoOverride | null }>('/api/console/seo', 'POST', {
      path,
      locale,
      title: next.title.trim(),
      description: next.description.trim(),
      focusKeyword: next.focusKeyword.trim(),
      ogTitle: next.ogTitle.trim(),
      ogDescription: next.ogDescription.trim(),
      ogImage: next.ogImage.trim(),
      canonical: next.canonical.trim(),
      noindex: next.noindex,
    });
    setSaving(false);
    if (result.error) {
      const mapped = `seo.error.${result.error}` as MessageKey;
      setNotice({ tone: 'danger', key: labels[mapped] ? mapped : errorKey(result.error) });
      return;
    }
    const saved = fromOverride(result.data?.override ?? null);
    setBaseline(saved);
    setForm(saved);
    setNotice({ tone: 'ok', key: 'seo.saved' });
  }

  const set = <K extends keyof SeoForm>(key: K, value: SeoForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setNotice(null);
  };

  const text = (key: Exclude<keyof SeoForm, 'noindex'>, props: { multiline?: boolean; placeholder?: string; max?: number; dir?: 'ltr' }) => {
    const common = {
      id: `${id}-${key}`,
      className: props.multiline ? 'console-screen-input console-screen-textarea' : 'console-screen-input',
      value: form[key],
      placeholder: props.placeholder,
      readOnly: !writable,
      disabled: saving,
      maxLength: props.max ?? 500,
      dir: props.dir,
      onBlur: () => void persist(form),
    };
    return props.multiline ? (
      <Textarea {...common} rows={3} onChange={(event) => set(key, event.target.value)} />
    ) : (
      <Input
        {...common}
        onChange={(event) => set(key, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
    );
  };

  const meter = (value: string, max: number) => {
    const status = seoStatus(value, max);
    return (
      <span className="console-screen-meter">
        <Badge tone={status === 'ok' ? 'ok' : status === 'long' ? 'warn' : 'danger'}>{labels[`seo.status.${status}` as MessageKey]}</Badge>
        <Note>{labels['seo.count'].replace('{n}', String(seoLength(value))).replace('{max}', String(max))}</Note>
      </span>
    );
  };

  return (
    <div className="console-seo-box">
      <div className="console-seo-score" data-grade={grade}>
        <span className="console-seo-score-ring" aria-hidden="true" style={{ '--c-score': score.score } as CSSProperties}>
          {score.score}
        </span>
        <div>
          <strong>{labels['seo.score']}</strong>
          <Badge tone={GRADE_TONE[grade]}>{labels[`seo.grade.${grade}` as MessageKey]}</Badge>
          <Button size="sm" variant="ghost" aria-expanded={showChecks} onClick={() => setShowChecks((open) => !open)}>
            {showChecks ? labels['seo.checks.hide'] : labels['seo.checks.show']}
          </Button>
        </div>
      </div>
      {showChecks && (
        <ul className="console-seo-checks">
          {score.checks.map((check) => (
            <li key={check.id} data-pass={check.pass ? 'yes' : 'no'}>
              <span aria-hidden="true">{check.pass ? '✓' : '✗'}</span> {labels[`seo.check.${check.id}` as MessageKey]}
            </li>
          ))}
        </ul>
      )}

      <Tabs
        items={(['general', 'social', 'advanced'] as const).map((item) => ({ id: item, label: labels[`seo.tab.${item}` as MessageKey] }))}
        value={tab}
        onChange={(next) => setTab(next as Tab)}
        label={labels['content.seo']}
        idBase={`${id}-seo-tabs`}
        className="console-tabs console-seo-tabs"
      >
        {tab === 'general' && (
          <div className="console-seo-fields">
            <Field label={labels['seo.focus_keyword']} htmlFor={`${id}-focusKeyword`} note={<Note>{labels['seo.focus_keyword.hint']}</Note>}>
              {text('focusKeyword', { max: 191 })}
            </Field>
            <Field label={labels['seo.column.title']} htmlFor={`${id}-title`} note={meter(title, SEO_TITLE_MAX)}>
              {text('title', { placeholder: inherited.title || labels['seo.placeholder.title'] })}
            </Field>
            <Field label={labels['seo.column.description']} htmlFor={`${id}-description`} note={meter(description, SEO_DESCRIPTION_MAX)}>
              {text('description', { multiline: true, max: 1000, placeholder: inherited.description || labels['seo.placeholder.description'] })}
            </Field>
            <figure className="console-serp" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
              <figcaption>{labels['seo.preview.serp']}</figcaption>
              <span className="console-serp-url" dir="ltr">{href}</span>
              <span className="console-serp-title">{[...title].slice(0, SEO_TITLE_MAX).join('') + (seoLength(title) > SEO_TITLE_MAX ? '…' : '')}</span>
              <span className="console-serp-text">{[...description].slice(0, SEO_DESCRIPTION_MAX).join('') + (seoLength(description) > SEO_DESCRIPTION_MAX ? '…' : '')}</span>
            </figure>
          </div>
        )}
        {tab === 'social' && (
          <div className="console-seo-fields">
            <Field label={labels['seo.og_title']} htmlFor={`${id}-ogTitle`}>
              {text('ogTitle', { placeholder: title })}
            </Field>
            <Field label={labels['seo.og_description']} htmlFor={`${id}-ogDescription`}>
              {text('ogDescription', { multiline: true, max: 1000, placeholder: description })}
            </Field>
            <Field label={labels['seo.og_image']} htmlFor={`${id}-ogImage`} note={<Note>{labels['seo.og_image.hint']}</Note>}>
              <ImagePicker
                labels={labels}
                inputId={`${id}-ogImage`}
                value={form.ogImage}
                disabled={!writable || saving}
                onChange={(next) => {
                  const updated = { ...form, ogImage: next };
                  setForm(updated);
                  void persist(updated);
                }}
              />
            </Field>
            <figure className="console-share-card">
              <figcaption>{labels['seo.preview.social']}</figcaption>
              {shareImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- a preview of the card, not a page image
                <img src={shareImage} alt="" />
              ) : (
                <span className="console-share-card-blank" />
              )}
              <span className="console-share-card-host" dir="ltr">{href.split('/').slice(0, 3).join('/') || href}</span>
              <strong>{shareTitle}</strong>
              <span>{shareDescription}</span>
            </figure>
          </div>
        )}
        {tab === 'advanced' && (
          <div className="console-seo-fields">
            <Field label={labels['seo.canonical']} htmlFor={`${id}-canonical`} note={<Note>{labels['seo.canonical.hint']}</Note>}>
              {text('canonical', { max: 512, dir: 'ltr', placeholder: href })}
            </Field>
            <Checkbox
              checked={form.noindex}
              disabled={!writable || saving}
              label={labels['seo.noindex']}
              onChange={(event) => {
                const updated = { ...form, noindex: event.target.checked };
                setForm(updated);
                void persist(updated);
              }}
            />
            <Note>{labels['seo.noindex.hint']}</Note>
          </div>
        )}
      </Tabs>

      <div className="console-seo-actions">
        <Note>{writable ? labels['seo.edit_hint'] : labels['seo.readonly']}</Note>
        {writable && !same(baseline, EMPTY) && (
          <Button
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              setForm(EMPTY);
              void persist(EMPTY);
            }}
          >
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
