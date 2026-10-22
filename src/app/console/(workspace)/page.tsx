import { message } from '@/lib/console/messages';
import { overviewRows } from '@/lib/console/overview';
import { consoleView } from '@/lib/console/server';

export const dynamic = 'force-dynamic';

/**
 * Real numbers from the database, one card per resource — and only for the
 * resources this role may read. Until BK-7 imports the WordPress content the honest
 * answer is zero, and the screen says so instead of hiding it.
 */
export default async function ConsoleOverviewPage() {
  const { auth, prefs } = await consoleView();
  if (!auth) return null; // the workspace layout has already redirected

  const rows = await overviewRows(auth.user.grants);

  return (
    <>
      <h1 className="console-heading">{message('overview.heading', prefs.locale)}</h1>
      <p className="console-lede">{message('overview.intro', prefs.locale)}</p>

      {rows.length === 0 ? (
        <p className="console-lede">{message('overview.not_allowed', prefs.locale)}</p>
      ) : (
        <dl className="console-grid">
          {rows.map((row) => (
            <div className="console-card" key={row.resource}>
              <dt>{message(row.label, prefs.locale)}</dt>
              <dd>{row.count === 0 ? message('overview.empty', prefs.locale) : row.count}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="console-note">{message('overview.coming_soon', prefs.locale)}</p>
    </>
  );
}
