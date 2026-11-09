'use client';

/**
 * 06 Promotions, on the Marketing screen: the announcement line at the top of the site
 * and the exit-intent prompt. Saved as one document through `/api/console/promo`, which
 * the Marketer's `integration` grant may write.
 */
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { consoleCall } from './client-api';
import { Button, Checkbox, Field, Input, Note, Select, Textarea, type Tone } from './kit';
import { SettingsSection } from './SettingsWorkspace';
import type { MessageKey } from '@/lib/console/messages';
import { cairoToday, inWindow, type Bi, type Promo, type PromptAction } from '@/lib/content/promo-shape';

type Labels = Record<MessageKey, string>;

function Pair({
  id,
  label,
  value,
  onChange,
  disabled,
  multiline,
  labels,
}: Readonly<{ id: string; label: string; value: Bi; onChange: (next: Bi) => void; disabled: boolean; multiline?: boolean; labels: Labels }>) {
  return (
    <div className="settings-brand-grid">
      {(['ar', 'en'] as const).map((language) => {
        const fieldId = `${id}-${language}`;
        const props = {
          id: fieldId,
          dir: language === 'ar' ? ('rtl' as const) : ('ltr' as const),
          value: value[language],
          disabled,
          onChange: (event: { target: { value: string } }) => onChange({ ...value, [language]: event.target.value }),
        };
        return (
          <Field key={language} label={`${label} · ${labels[`content.locale.${language}` as MessageKey]}`} htmlFor={fieldId}>
            {multiline ? <Textarea rows={2} {...props} /> : <Input {...props} />}
          </Field>
        );
      })}
    </div>
  );
}

export function PromotionsPanel({ initial, canWrite, labels }: Readonly<{ initial: Promo; canWrite: boolean; labels: Labels }>) {
  const id = useId();
  const router = useRouter();
  const [promo, setPromo] = useState<Promo>(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: Tone; key: MessageKey } | null>(null);
  const dirty = JSON.stringify(promo) !== baseline;
  const off = !canWrite || busy;
  const a = promo.announcement;
  const e = promo.exitPrompt;
  const today = cairoToday();

  const setA = (patch: Partial<Promo['announcement']>) => setPromo({ ...promo, announcement: { ...a, ...patch } });
  const setE = (patch: Partial<Promo['exitPrompt']>) => setPromo({ ...promo, exitPrompt: { ...e, ...patch } });

  async function save(): Promise<void> {
    setBusy(true);
    setNotice(null);
    const result = await consoleCall<{ promo: Promo }>('/api/console/promo', 'PATCH', { promo });
    setBusy(false);
    if (result.error || !result.data?.promo) {
      setNotice({ tone: 'danger', key: result.error === 'forbidden' ? 'settings.brand.forbidden' : 'settings.brand.failed' });
      return;
    }
    setPromo(result.data.promo);
    setBaseline(JSON.stringify(result.data.promo));
    setNotice({ tone: 'ok', key: 'settings.brand.saved' });
    router.refresh();
  }

  const status = (enabled: boolean, startsOn: string, endsOn: string): { tone: Tone; key: MessageKey } => {
    if (!enabled) return { tone: 'neutral', key: 'promo.status.off' };
    if (!inWindow(startsOn, endsOn, today)) return { tone: 'warn', key: endsOn && today > endsOn ? 'promo.status.ended' : 'promo.status.scheduled' };
    return { tone: 'ok', key: 'promo.status.live' };
  };
  const aStatus = status(a.enabled, a.startsOn, a.endsOn);
  const eStatus = status(e.enabled, e.startsOn, e.endsOn);

  const dates = (prefix: string, startsOn: string, endsOn: string, set: (patch: { startsOn?: string; endsOn?: string }) => void) => (
    <div className="settings-brand-grid">
      <Field label={labels['promo.starts']} htmlFor={`${id}-${prefix}-start`}>
        <Input id={`${id}-${prefix}-start`} type="date" value={startsOn} disabled={off} onChange={(event) => set({ startsOn: event.target.value })} />
      </Field>
      <Field label={labels['promo.ends']} htmlFor={`${id}-${prefix}-end`}>
        <Input id={`${id}-${prefix}-end`} type="date" value={endsOn} disabled={off} onChange={(event) => set({ endsOn: event.target.value })} />
      </Field>
    </div>
  );

  return (
    <div className="settings-workspace settings-workspace-more">
      <SettingsSection
        id="tracking-promo"
        index="06"
        title={labels['promo.heading']}
        lede={labels['promo.intro']}
        dirty={dirty}
        dirtyLabel={labels['settings.unsaved']}
        busy={busy}
        footer={
          canWrite ? (
            <div className="settings-brand-foot">
              <Button variant="primary" loading={busy} disabled={!dirty || busy} onClick={() => void save()}>
                {labels['content.save']}
              </Button>
              {notice && <Note tone={notice.tone}>{labels[notice.key]}</Note>}
            </div>
          ) : null
        }
      >
        <h3 className="settings-brand-sub">
          {labels['promo.announcement']} <Note tone={aStatus.tone}>{labels[aStatus.key]}</Note>
        </h3>
        <Checkbox checked={a.enabled} disabled={off} label={labels['promo.announcement.enable']} onChange={(event) => setA({ enabled: event.target.checked })} />
        <Pair id={`${id}-a-text`} label={labels['promo.announcement.text']} value={a.text} disabled={off} labels={labels} onChange={(text) => setA({ text })} />
        <Pair id={`${id}-a-link`} label={labels['promo.link_label']} value={a.linkLabel} disabled={off} labels={labels} onChange={(linkLabel) => setA({ linkLabel })} />
        <Field label={labels['promo.href']} htmlFor={`${id}-a-href`} note={<Note>{labels['promo.href_hint']}</Note>}>
          <Input id={`${id}-a-href`} dir="ltr" value={a.href} placeholder="/offers" disabled={off} onChange={(event) => setA({ href: event.target.value })} />
        </Field>
        {dates('a', a.startsOn, a.endsOn, setA)}

        <h3 className="settings-brand-sub">
          {labels['promo.exit']} <Note tone={eStatus.tone}>{labels[eStatus.key]}</Note>
        </h3>
        <Note>{labels['promo.exit.hint']}</Note>
        <Checkbox checked={e.enabled} disabled={off} label={labels['promo.exit.enable']} onChange={(event) => setE({ enabled: event.target.checked })} />
        <Pair id={`${id}-e-title`} label={labels['promo.exit.title']} value={e.title} disabled={off} labels={labels} onChange={(title) => setE({ title })} />
        <Pair id={`${id}-e-text`} label={labels['promo.exit.text']} value={e.text} disabled={off} labels={labels} multiline onChange={(text) => setE({ text })} />
        <Pair id={`${id}-e-button`} label={labels['promo.exit.button']} value={e.button} disabled={off} labels={labels} onChange={(button) => setE({ button })} />
        <div className="settings-brand-grid">
          <Field label={labels['promo.exit.action']} htmlFor={`${id}-e-action`}>
            <Select id={`${id}-e-action`} value={e.action} disabled={off} onChange={(event) => setE({ action: event.target.value as PromptAction })}>
              <option value="booking">{labels['promo.exit.action.booking']}</option>
              <option value="whatsapp">{labels['promo.exit.action.whatsapp']}</option>
              <option value="link">{labels['promo.exit.action.link']}</option>
            </Select>
          </Field>
          {e.action === 'link' && (
            <Field label={labels['promo.href']} htmlFor={`${id}-e-href`}>
              <Input id={`${id}-e-href`} dir="ltr" value={e.href} placeholder="/offers" disabled={off} onChange={(event) => setE({ href: event.target.value })} />
            </Field>
          )}
          <Field label={labels['promo.exit.delay']} htmlFor={`${id}-e-delay`}>
            <Input
              id={`${id}-e-delay`}
              type="number"
              min={0}
              max={120}
              value={e.delaySeconds}
              disabled={off}
              onChange={(event) => setE({ delaySeconds: Number(event.target.value) })}
            />
          </Field>
        </div>
        <Checkbox checked={e.desktopOnly} disabled={off} label={labels['promo.exit.desktop_only']} onChange={(event) => setE({ desktopOnly: event.target.checked })} />
        {dates('e', e.startsOn, e.endsOn, setE)}
      </SettingsSection>
    </div>
  );
}
