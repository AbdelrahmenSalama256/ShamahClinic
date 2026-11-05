import { HeroScreen } from '@/components/console/HeroScreen';
import { Empty } from '@/components/console/kit';
import { can } from '@/lib/auth/permissions';
import { catalogFor, message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
import { readHeroDocument } from '@/lib/hero/store';

export const dynamic = 'force-dynamic';

/**
 * The homepage slider.
 *
 * The read/write pair is the home page's own grant, and it is asked without a locale: the
 * document holds both languages in one row, so a grant limited to Arabic cannot be honoured
 * without letting that person rewrite the English copy too. The API asks the same question,
 * which is why a read-only visitor here sees disabled controls rather than a 403 on save.
 */
export default async function ConsoleHeroPage() {
  const { auth, prefs } = await consoleView();
  if (!auth) return null; // the workspace layout has already redirected

  const grants = auth.user.grants;
  if (!can(grants, 'page', 'read', {})) {
    return <Empty>{message('content.no_permission', prefs.locale)}</Empty>;
  }

  const hero = await readHeroDocument();

  return (
    <>
      <h1 className="console-heading">{message('nav.hero', prefs.locale)}</h1>
      <p className="console-lede">{message('hero.intro', prefs.locale)}</p>
      <HeroScreen
        hero={hero}
        locale={prefs.locale}
        labels={catalogFor(prefs.locale)}
        canWrite={can(grants, 'page', 'update', {})}
      />
    </>
  );
}
