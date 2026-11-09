'use client';

/**
 * Two more Settings sections, in the same frame as the five above them:
 *
 *   06 Brand & social     logo, social accounts, map link, trust details, WhatsApp words
 *   07 Homepage sections  the order the homepage bands paint in, and which are shown
 *
 * Each is one document in `settings`, saved whole through the same guarded PATCH the
 * other sections use, and re-validated by the server before it is stored.
 */
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { consoleCall } from './client-api';
import { Button, Checkbox, Field, Input, Note, Textarea, type Tone } from './kit';
import { ImagePicker } from './ImagePicker';
import { SettingsSection } from './SettingsWorkspace';
import type { MessageKey } from '@/lib/console/messages';
import { BRAND_GROUP, BRAND_KEY, SOCIAL_LABELS, SOCIAL_NETWORKS, type BrandProfile, type SocialNetwork } from '@/lib/content/brand-shape';
import { HOME_BAND_LABELS, HOME_LAYOUT_GROUP, HOME_LAYOUT_KEY, type HomeBandState } from '@/lib/content/home-layout-shape';

type Labels = Record<MessageKey, string>;
type Notice = { tone: Tone; key: MessageKey } | null;

function useSave(labels: Labels) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  async function save(group: string, key: string, value: unknown): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    const result = await consoleCall('/api/console/settings', 'PATCH', { group, key, value });
    setBusy(false);
    if (result.error) {
      setNotice({ tone: 'danger', key: result.error === 'forbidden' ? 'settings.brand.forbidden' : 'settings.brand.failed' });
      return false;
    }
    setNotice({ tone: 'ok', key: 'settings.brand.saved' });
    router.refresh();
    return true;
  }
  return { busy, notice, save, labels };
}

export function BrandSettings({
  brand,
  layout,
  canWrite,
  locale,
  labels,
}: Readonly<{ brand: BrandProfile; layout: HomeBandState[]; canWrite: boolean; locale: 'ar' | 'en'; labels: Labels }>) {
  const id = useId();
  const [draft, setDraft] = useState<BrandProfile>(brand);
  const [baseline, setBaseline] = useState(() => JSON.stringify(brand));
  const [bands, setBands] = useState<HomeBandState[]>(layout);
  const [bandsBaseline, setBandsBaseline] = useState(() => JSON.stringify(layout));
  const brandSave = useSave(labels);
  const homeSave = useSave(labels);

  const brandDirty = JSON.stringify(draft) !== baseline;
  const bandsDirty = JSON.stringify(bands) !== bandsBaseline;
  const off = !canWrite || brandSave.busy;

  const urlOf = (network: SocialNetwork) => draft.socials.find((link) => link.id === network)?.href ?? '';
  const setSocial = (network: SocialNetwork, href: string) => {
    const others = draft.socials.filter((link) => link.id !== network);
    const next = href.trim() ? [...others, { id: network, href, label: SOCIAL_LABELS[network] }] : others;
    // Keep the footer's icon order stable: the order the networks are listed in.
    next.sort((a, b) => SOCIAL_NETWORKS.indexOf(a.id) - SOCIAL_NETWORKS.indexOf(b.id));
    setDraft({ ...draft, socials: next });
  };

  const move = (index: number, step: -1 | 1) => {
    const next = [...bands];
    const target = index + step;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setBands(next);
  };

  return (
    <>
      <SettingsSection
        id="settings-brand"
        index="06"
        title={labels['settings.brand.heading']}
        lede={labels['settings.brand.intro']}
        dirty={brandDirty}
        dirtyLabel={labels['settings.unsaved']}
        busy={brandSave.busy}
        footer={
          canWrite ? (
            <div className="settings-brand-foot">
              <Button
                variant="primary"
                loading={brandSave.busy}
                disabled={!brandDirty || brandSave.busy}
                onClick={async () => {
                  if (await brandSave.save(BRAND_GROUP, BRAND_KEY, draft)) setBaseline(JSON.stringify(draft));
                }}
              >
                {labels['content.save']}
              </Button>
              {brandSave.notice && <Note tone={brandSave.notice.tone}>{labels[brandSave.notice.key]}</Note>}
            </div>
          ) : null
        }
      >
        <div className="console-fields settings-brand-grid">
          <Field label={labels['settings.brand.logo']} htmlFor={`${id}-logo`} note={<Note>{labels['settings.brand.logo_hint']}</Note>}>
            <ImagePicker labels={labels} inputId={`${id}-logo`} value={draft.logo} disabled={off} onChange={(logo) => setDraft({ ...draft, logo })} />
          </Field>
          <Field label={labels['settings.brand.payment']} htmlFor={`${id}-payment`} note={<Note>{labels['settings.brand.payment_hint']}</Note>}>
            <ImagePicker labels={labels} inputId={`${id}-payment`} value={draft.paymentImage} disabled={off} onChange={(paymentImage) => setDraft({ ...draft, paymentImage })} />
          </Field>
        </div>

        <h3 className="settings-brand-sub">{labels['settings.brand.socials']}</h3>
        <Note>{labels['settings.brand.socials_hint']}</Note>
        <div className="console-fields settings-brand-grid">
          {SOCIAL_NETWORKS.map((network) => (
            <Field key={network} label={SOCIAL_LABELS[network]} htmlFor={`${id}-${network}`}>
              <Input id={`${id}-${network}`} dir="ltr" type="url" placeholder="https://" value={urlOf(network)} disabled={off} onChange={(event) => setSocial(network, event.target.value)} />
            </Field>
          ))}
        </div>

        <h3 className="settings-brand-sub">{labels['settings.brand.trust']}</h3>
        <div className="console-fields settings-brand-grid">
          <Field label={labels['settings.brand.maps']} htmlFor={`${id}-maps`} note={<Note>{labels['settings.brand.maps_hint']}</Note>}>
            <Input id={`${id}-maps`} dir="ltr" type="url" placeholder="https://maps.google.com/…" value={draft.mapsUrl} disabled={off} onChange={(event) => setDraft({ ...draft, mapsUrl: event.target.value })} />
          </Field>
          <Field label={labels['settings.brand.commercial_reg']} htmlFor={`${id}-cr`}>
            <Input id={`${id}-cr`} dir="ltr" value={draft.commercialReg} disabled={off} onChange={(event) => setDraft({ ...draft, commercialReg: event.target.value })} />
          </Field>
          <Field label={labels['settings.brand.tax_id']} htmlFor={`${id}-tax`}>
            <Input id={`${id}-tax`} dir="ltr" value={draft.taxId} disabled={off} onChange={(event) => setDraft({ ...draft, taxId: event.target.value })} />
          </Field>
        </div>

        <h3 className="settings-brand-sub">{labels['settings.brand.whatsapp']}</h3>
        <Note>{labels['settings.brand.whatsapp_hint']}</Note>
        <div className="console-fields settings-brand-grid">
          {(['ar', 'en'] as const).map((language) => (
            <Field key={language} label={labels[`settings.brand.whatsapp.${language}` as MessageKey]} htmlFor={`${id}-wa-${language}`}>
              <Textarea
                id={`${id}-wa-${language}`}
                rows={3}
                dir={language === 'ar' ? 'rtl' : 'ltr'}
                value={draft.whatsappMessage[language]}
                disabled={off}
                onChange={(event) => setDraft({ ...draft, whatsappMessage: { ...draft.whatsappMessage, [language]: event.target.value } })}
              />
            </Field>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        id="settings-home"
        index="07"
        title={labels['settings.home.heading']}
        lede={labels['settings.home.intro']}
        dirty={bandsDirty}
        dirtyLabel={labels['settings.unsaved']}
        busy={homeSave.busy}
        footer={
          canWrite ? (
            <div className="settings-brand-foot">
              <Button
                variant="primary"
                loading={homeSave.busy}
                disabled={!bandsDirty || homeSave.busy}
                onClick={async () => {
                  if (await homeSave.save(HOME_LAYOUT_GROUP, HOME_LAYOUT_KEY, bands)) setBandsBaseline(JSON.stringify(bands));
                }}
              >
                {labels['content.save']}
              </Button>
              {homeSave.notice && <Note tone={homeSave.notice.tone}>{labels[homeSave.notice.key]}</Note>}
            </div>
          ) : null
        }
      >
        <ol className="settings-home-bands">
          <li className="settings-home-band" data-fixed="true">
            <span className="settings-home-name">{labels['settings.home.hero']}</span>
            <Note>{labels['settings.home.hero_note']}</Note>
          </li>
          {bands.map((band, index) => (
            <li key={band.key} className="settings-home-band" data-hidden={!band.visible || undefined}>
              <Checkbox
                checked={band.visible}
                disabled={!canWrite || homeSave.busy}
                label={HOME_BAND_LABELS[band.key][locale]}
                onChange={(event) => setBands(bands.map((entry) => (entry.key === band.key ? { ...entry, visible: event.target.checked } : entry)))}
              />
              <span className="settings-home-move">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${labels['settings.home.up']}: ${HOME_BAND_LABELS[band.key][locale]}`}
                  disabled={!canWrite || homeSave.busy || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp aria-hidden="true" size={16} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${labels['settings.home.down']}: ${HOME_BAND_LABELS[band.key][locale]}`}
                  disabled={!canWrite || homeSave.busy || index === bands.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown aria-hidden="true" size={16} />
                </Button>
              </span>
            </li>
          ))}
        </ol>
      </SettingsSection>
    </>
  );
}
