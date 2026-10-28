import { SettingsWorkspace } from '@/components/console/SettingsWorkspace';
import { Empty } from '@/components/console/kit';
import { siteConfig } from '@/config/site';
import { can } from '@/lib/auth/permissions';
import { catalogFor, message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
import { readBanners } from '@/lib/content/banners';
import { readPageStates } from '@/lib/content/page-visibility';
import { SEO_SETTING_GROUP, SITE_SETTING_GROUP } from '@/lib/content/settings-catalog';
import { readSettings } from '@/lib/content/settings';
import { getSettings } from '@/lib/content/site';

export const dynamic = 'force-dynamic';

/**
 * Settings take effect as they are saved — there is no draft copy of a site
 * setting, so this screen has no publish step. Only Owner and Admin hold
 * `setting.update`; everyone else reads, and a secret never reaches either.
 *
 * `defaults` is what each field shows before its first save: the authored value in
 * `src/config/site.ts` or the site's own fallbacks. It is not a second copy of the
 * read path — `getSettings` already applies the same fallback the public site uses.
 */
export default async function ConsoleSettingsPage() {
  const { auth, prefs } = await consoleView();
  if (!auth) return null; // the workspace layout has already redirected

  const grants = auth.user.grants;
  if (!can(grants, 'setting', 'read', {})) return <Empty>{message('content.no_permission', prefs.locale)}</Empty>;

  const [rows, pages, site, banners] = await Promise.all([
    readSettings(),
    readPageStates(),
    getSettings(prefs.locale),
    readBanners(),
  ]);
  const defaults: Record<string, string> = {
    [`${SITE_SETTING_GROUP}.name`]: site.name,
    [`${SITE_SETTING_GROUP}.tagline`]: site.tagline,
    [`${SITE_SETTING_GROUP}.phone`]: site.phone,
    [`${SITE_SETTING_GROUP}.whatsapp`]: site.whatsapp,
    [`${SITE_SETTING_GROUP}.email`]: site.email,
    [`${SITE_SETTING_GROUP}.hours`]: site.hours,
    [`${SEO_SETTING_GROUP}.title.ar`]: siteConfig.metadata.title,
    [`${SEO_SETTING_GROUP}.title.en`]: siteConfig.metadata.titleEn,
    [`${SEO_SETTING_GROUP}.description.ar`]: siteConfig.metadata.description,
    [`${SEO_SETTING_GROUP}.description.en`]: siteConfig.metadata.descriptionEn,
  };

  return (
    <>
      <h1 className="console-heading">{message('nav.settings', prefs.locale)}</h1>
      <SettingsWorkspace
        rows={rows}
        pages={pages}
        banners={banners}
        defaults={defaults}
        locale={prefs.locale}
        labels={catalogFor(prefs.locale)}
        canWrite={can(grants, 'setting', 'update', {})}
      />
    </>
  );
}
