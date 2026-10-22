/**
 * The route that saves the signed-in account's own locale, theme and density. Plain
 * `Request` -> `Response` like the rest of the auth core, and it goes through
 * `guard()`: `self.update` needs no grant, so a Viewer can switch the console to
 * English, and nothing else on that row is writable from here.
 *
 * Locale and theme land on the `users` row *and* the cookie; density is the cookie only,
 * because it describes the screen this person is sitting at rather than the person. All
 * three are required by the schema — a caller that omits one gets a 400 rather than a
 * silent reset of the choice it did not mention, and the only caller (`ConsoleControls`)
 * always sends the whole `ConsolePrefs` it was rendered with.
 */
import { z } from 'zod';
import { db } from '../db';
import { appendCookies, guard } from '../auth/guard';
import { cookiesRequireSecure, serializeCookie } from '../auth/cookies';
import { PREFS_COOKIE, PREFS_TTL_DAYS, densityOf, encodePrefs, localeOf, themeOf, type ConsolePrefs } from './prefs';

const prefsSchema = z.object({ locale: z.string().max(8), theme: z.string().max(8), density: z.string().max(16) });

function prefsCookie(req: Request, prefs: ConsolePrefs): string[] {
  return [
    serializeCookie(PREFS_COOKIE, encodePrefs(prefs), {
      path: '/',
      maxAgeSeconds: PREFS_TTL_DAYS * 24 * 60 * 60,
      sameSite: 'lax',
      secure: cookiesRequireSecure(req),
    }),
  ];
}

export async function updatePrefsHandler(req: Request): Promise<Response> {
  // The cookie has to be set on the response `guard()` builds, so the handler
  // stashes what it saved and the caller puts it on the headers.
  const saved: { value: ConsolePrefs | null } = { value: null };

  const res = await guard<z.output<typeof prefsSchema>, { prefs?: ConsolePrefs; error?: string }>(
    req,
    { resource: 'self', action: 'update', schema: prefsSchema },
    async ({ auth, input }) => {
      const locale = localeOf(input.locale);
      const theme = themeOf(input.theme);
      const density = densityOf(input.density);
      if (!locale || !theme || !density) return { status: 400, data: { error: 'invalid_input' } };

      const before = { locale: auth.user.locale, theme: auth.user.theme };
      await db.updateTable('users').set({ locale, theme, updated_by: auth.user.id }).where('id', '=', auth.user.id).execute();
      saved.value = { locale, theme, density };
      return { data: { prefs: saved.value }, audit: { before, after: { locale, theme, density } } };
    },
  );

  return saved.value ? appendCookies(res, prefsCookie(req, saved.value)) : res;
}
