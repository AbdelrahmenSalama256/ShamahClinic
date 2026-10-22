import type { ConsoleUser } from '@/lib/auth/sessions';
import { message } from '@/lib/console/messages';
import type { ConsolePrefs } from '@/lib/console/prefs';
import { navStrip, navTree, palettePlaces } from '@/lib/console/screens';
import { ConsoleControls } from './ConsoleControls';
import { ConsoleFrame } from './ConsoleFrame';

/**
 * The console's frame: brand, the signed-in account, and the screens this role may
 * read. Deliberately none of the site's header, footer or providers — marketing gets
 * a work surface, not the brochure.
 *
 * This half only decides *what* the chrome says: every label is read here, on the
 * server, in the console's own locale, and handed to `ConsoleFrame`, whose only job is
 * where those labels live at each width.
 *
 * The navigation comes from the grants, not from a list of screens: what the role may
 * read decides which rows exist at all, and what it may write decides which are greyed.
 * See `navTree`.
 */
export function ConsoleShell({
  prefs,
  user,
  children,
}: Readonly<{
  prefs: ConsolePrefs;
  user: ConsoleUser;
  children: React.ReactNode;
}>) {
  const tree = navTree(user.grants, prefs.locale);
  const strip = navStrip(user.grants, prefs.locale);
  const places = palettePlaces(user.grants, prefs.locale);

  const brand = (
    <span className="console-brand">
      <strong>{message('brand.title', prefs.locale)}</strong>
      <span>{message('brand.subtitle', prefs.locale)}</span>
    </span>
  );

  const controls = (
    <ConsoleControls
      prefs={prefs}
      labels={{
        viewSite: message('shell.view_site', prefs.locale),
        signOut: message('shell.sign_out', prefs.locale),
        toLight: message('shell.theme.light', prefs.locale),
        toDark: message('shell.theme.dark', prefs.locale),
        switchLocale: message('shell.locale.switch', prefs.locale),
        toComfortable: message('shell.density.comfortable', prefs.locale),
        toDense: message('shell.density.dense', prefs.locale),
      }}
    />
  );

  const account = (
    <div className="console-account">
      <span className="console-account-label">{message('shell.signed_in_as', prefs.locale)}</span>
      <strong>{user.name || user.email}</strong>
      <span className="console-account-label">{message('shell.roles', prefs.locale)}</span>
      <span>
        {user.roles.map((role) => (
          <span key={role} className="console-chip">
            {role}
          </span>
        ))}
      </span>
    </div>
  );

  return (
    <ConsoleFrame
      tree={tree}
      strip={strip}
      places={places}
      labels={{
        screens: message('shell.screens', prefs.locale),
        close: message('shell.close', prefs.locale),
        readOnly: message('nav.readonly', prefs.locale),
        palette: {
          open: message('palette.open', prefs.locale),
          placeholder: message('palette.placeholder', prefs.locale),
          screens: message('palette.screens', prefs.locale),
          records: message('palette.records', prefs.locale),
          searching: message('palette.searching', prefs.locale),
          empty: message('palette.empty', prefs.locale),
          shortcut: message('palette.shortcut', prefs.locale),
          readOnly: message('nav.readonly', prefs.locale),
        },
      }}
      brand={brand}
      controls={controls}
      account={account}
    >
      {children}
    </ConsoleFrame>
  );
}
