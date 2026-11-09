'use client';

/**
 * The site-wide SEO settings, as one form with one Save. Unlike the per-page fields these
 * are switches a person sets together — turn indexing back on and add the verification code
 * in one sitting — so the form saves as a whole and says so.
 */
import { useId, useState } from 'react';
import { consoleCall } from './client-api';
import { Button, Card, Checkbox, Field, Input, Note, Select, Textarea, type Tone } from './kit';
import { ImagePicker } from './ImagePicker';
import type { MessageKey } from '@/lib/console/messages';
import {
  SITEMAP_SECTIONS,
  TITLE_SEPARATORS,
  VERIFICATION_KEYS,
  type SeoConfig,
} from '@/lib/content/seo-config-shape';

export function SeoConfigForm({
  initial,
  writable,
  labels,
}: Readonly<{ initial: SeoConfig; writable: boolean; labels: Record<MessageKey, string> }>) {
  const id = useId();
  const [config, setConfig] = useState<SeoConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: Tone; key: MessageKey } | null>(null);
  const [dirty, setDirty] = useState(false);

  const update = (patch: Partial<SeoConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
    setDirty(true);
    setNotice(null);
  };

  async function save(): Promise<void> {
    setSaving(true);
    const result = await consoleCall<{ config: SeoConfig }>('/api/console/seo/config', 'PATCH', { config });
    setSaving(false);
    if (result.error || !result.data?.config) {
      setNotice({ tone: 'danger', key: result.error === 'forbidden' ? 'seo.error.forbidden' : 'seo.failed' });
      return;
    }
    setConfig(result.data.config);
    setDirty(false);
    setNotice({ tone: 'ok', key: 'seo.config.saved' });
  }

  const off = !writable || saving;

  return (
    <div className="console-seo-config">
      <Card as="section" className="console-panel">
        <h2 className="console-subheading">{labels['seo.config.general']}</h2>
        <Checkbox
          checked={config.indexing}
          disabled={off}
          label={labels['seo.config.indexing']}
          onChange={(event) => update({ indexing: event.target.checked })}
        />
        <Note tone={config.indexing ? 'neutral' : 'danger'}>
          {config.indexing ? labels['seo.config.indexing.hint'] : labels['seo.config.indexing.off']}
        </Note>
        <Field label={labels['seo.config.separator']} htmlFor={`${id}-sep`} note={<Note>{labels['seo.config.separator.hint']}</Note>}>
          <Select id={`${id}-sep`} value={config.separator} disabled={off} onChange={(event) => update({ separator: event.target.value })}>
            {TITLE_SEPARATORS.map((sep) => (
              <option key={sep} value={sep}>
                {`${labels['seo.config.separator.sample']} ${sep} ${labels['brand.title']}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={labels['seo.config.default_og']} htmlFor={`${id}-og`} note={<Note>{labels['seo.config.default_og.hint']}</Note>}>
          <ImagePicker labels={labels} inputId={`${id}-og`} value={config.defaultOgImage} disabled={off} onChange={(next) => update({ defaultOgImage: next })} />
        </Field>
      </Card>

      <Card as="section" className="console-panel">
        <h2 className="console-subheading">{labels['seo.config.social']}</h2>
        <Field label={labels['seo.config.twitter']} htmlFor={`${id}-tw`}>
          <Input id={`${id}-tw`} dir="ltr" value={config.twitterSite} placeholder="@shamahclinics" disabled={off} onChange={(event) => update({ twitterSite: event.target.value })} />
        </Field>
        <Field label={labels['seo.config.facebook_app']} htmlFor={`${id}-fb`}>
          <Input id={`${id}-fb`} dir="ltr" inputMode="numeric" value={config.facebookAppId} disabled={off} onChange={(event) => update({ facebookAppId: event.target.value })} />
        </Field>
      </Card>

      <Card as="section" className="console-panel">
        <h2 className="console-subheading">{labels['seo.config.verification']}</h2>
        <Note>{labels['seo.config.verification.hint']}</Note>
        {VERIFICATION_KEYS.map((engine) => (
          <Field key={engine} label={labels[`seo.config.verification.${engine}` as MessageKey]} htmlFor={`${id}-v-${engine}`}>
            <Input
              id={`${id}-v-${engine}`}
              dir="ltr"
              value={config.verification[engine]}
              disabled={off}
              onChange={(event) => update({ verification: { ...config.verification, [engine]: event.target.value } })}
            />
          </Field>
        ))}
      </Card>

      <Card as="section" className="console-panel">
        <h2 className="console-subheading">{labels['seo.config.crawl']}</h2>
        <Field label={labels['seo.config.robots']} htmlFor={`${id}-robots`} note={<Note>{labels['seo.config.robots.hint']}</Note>}>
          <Textarea
            id={`${id}-robots`}
            dir="ltr"
            rows={4}
            value={config.robotsExtra}
            placeholder={'Disallow: /private\nAllow: /private/open'}
            disabled={off}
            onChange={(event) => update({ robotsExtra: event.target.value })}
          />
        </Field>
        <fieldset className="console-seo-sitemap">
          <legend>{labels['seo.config.sitemap']}</legend>
          {SITEMAP_SECTIONS.map((section) => (
            <Checkbox
              key={section}
              checked={config.sitemap[section]}
              disabled={off}
              label={labels[`seo.section.${section}` as MessageKey]}
              onChange={(event) => update({ sitemap: { ...config.sitemap, [section]: event.target.checked } })}
            />
          ))}
        </fieldset>
        <p className="console-seo-links">
          <a href="/robots.txt" target="_blank" rel="noreferrer">robots.txt</a>
          <a href="/sitemap.xml" target="_blank" rel="noreferrer">sitemap.xml</a>
        </p>
      </Card>

      {writable ? (
        <div className="console-seo-config-save">
          <Button variant="primary" onClick={() => void save()} disabled={!dirty || saving} loading={saving}>
            {labels['seo.config.save']}
          </Button>
          {notice && <Note tone={notice.tone}>{labels[notice.key]}</Note>}
        </div>
      ) : (
        <Note>{labels['seo.readonly']}</Note>
      )}
    </div>
  );
}
