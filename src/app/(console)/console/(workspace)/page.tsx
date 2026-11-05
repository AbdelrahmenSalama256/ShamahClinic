import { Card, Empty } from '@/components/console/kit';
import { OverviewScreen } from '@/components/console/OverviewScreen';
import { can } from '@/lib/auth/permissions';
import { catalogFor, message } from '@/lib/console/messages';
import { defaultOverviewQuery, overviewData, overviewRows, parseOverviewSearch } from '@/lib/console/overview';
import { consoleView } from '@/lib/console/server';

export const dynamic = 'force-dynamic';

interface Props {
  /** The period is in the URL: `?range=30d&compare=1` or `?range=custom&from=&to=`. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The Overview is drawn from server aggregates, so the first paint is already the
 * period the address names — no skeleton, no second request. A role without `stat.read`
 * still gets the one thing it could always have: the count of the rows it may read.
 */
export default async function ConsoleOverviewPage({ searchParams }: Props) {
  const { auth, prefs } = await consoleView();
  if (!auth) return null; // the workspace layout has already redirected

  const grants = auth.user.grants;

  if (!can(grants, 'stat', 'read', {})) {
    const rows = await overviewRows(grants);
    return (
      <>
        <h1 className="console-heading">{message('overview.heading', prefs.locale)}</h1>
        <p className="console-lede">{message('overview.intro', prefs.locale)}</p>
        {rows.length === 0 ? (
          <Empty>{message('overview.not_allowed', prefs.locale)}</Empty>
        ) : (
          <dl className="console-grid">
            {rows.map((row) => (
              <Card className="console-stat" key={row.resource}>
                <dt>{message(row.label, prefs.locale)}</dt>
                <dd>{row.count}</dd>
              </Card>
            ))}
          </dl>
        )}
      </>
    );
  }

  const parsed = parseOverviewSearch(await searchParams);
  // A hand-typed period that is not one shows the default instead; the screen validates
  // the next period before it writes it into the address bar.
  const query = 'error' in parsed ? defaultOverviewQuery() : parsed;
  const initial = await overviewData({ query, grants });

  return <OverviewScreen initial={initial} labels={catalogFor(prefs.locale)} locale={prefs.locale} />;
}
