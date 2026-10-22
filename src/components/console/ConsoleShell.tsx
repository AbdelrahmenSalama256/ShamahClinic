import type { ConsoleUser } from '@/lib/auth/sessions';
import type { MessageKey } from '@/lib/console/messages';
import { message } from '@/lib/console/messages';
import type { ConsolePrefs } from '@/lib/console/prefs';
import type { ConsoleScreen } from '@/lib/console/screens';
import { ConsoleControls } from './ConsoleControls';
import { ConsoleNav } from './ConsoleNav';

/**
 * The console's frame: brand, the signed-in account, and a sidebar of the screens
 * this role may read. Deliberately none of the site's header, footer or providers —
 * marketing gets a work surface, not the brochure.
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

  return (
    <div className="console-frame">
      <header className="console-header">
        <span className="console-brand">
          <strong>{message('brand.title', prefs.locale)}</strong>
          <span>{message('brand.subtitle', prefs.locale)}</span>
        </span>
        <ConsoleControls
          prefs={prefs}
          labels={{
            viewSite: message('shell.view_site', prefs.locale),
            signOut: message('shell.sign_out', prefs.locale),
            toLight: message('shell.theme.light', prefs.locale),
            toDark: message('shell.theme.dark', prefs.locale),
            switchLocale: message('shell.locale.switch', prefs.locale),
          }}
        />
      </header>

      <aside className="console-side">
        <ConsoleNav items={items} />
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
      </aside>

      <main className="console-main">{children}</main>
    </div>
  );
}
