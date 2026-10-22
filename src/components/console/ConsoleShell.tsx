import type { ConsoleUser } from '@/lib/auth/sessions';
import type { MessageKey } from '@/lib/console/messages';
import { message } from '@/lib/console/messages';
import type { ConsolePrefs } from '@/lib/console/prefs';
import type { ConsoleScreen } from '@/lib/console/screens';
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
 */
export function ConsoleShell({
  prefs,
  user,
  screens,
  children,
}: Readonly<{
  prefs: ConsolePrefs;
  user: ConsoleUser;
  screens: readonly ConsoleScreen[];
  children: React.ReactNode;
}>) {
  const items = screens.map((screen) => ({ key: screen.key, path: screen.path, label: message(`nav.${screen.key}` as MessageKey, prefs.locale) }));
  const screensLabel = message('shell.screens', prefs.locale);

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
      items={items}
      labels={{ screens: screensLabel, close: message('shell.close', prefs.locale) }}
      brand={brand}
      controls={controls}
      account={account}
    >
      {children}
    </ConsoleFrame>
  );
}
