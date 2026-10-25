import type { Metadata, Viewport } from 'next';
import { tajawal } from '@/lib/fonts';
import { siteConfig } from '@/config/site';
import { dirOf } from '@/lib/console/prefs';
import { message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
// The console is a document root of its own and reads only its own two sheets. It never
// imports `globals.css` (the public page's element rules, `img { width: 100% !important }`,
// would flatten every thumbnail), and it no longer imports the site token layer or the
// shared controls either: `console.css` declares a complete `--c-*` palette, and
// `console-kit.css` paints every control from it.
import './console-kit.css';
import './console.css';

/** Every console page depends on who is asking. */
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: siteConfig.brand.themeColor,
};

export async function generateMetadata(): Promise<Metadata> {
  const { prefs } = await consoleView();
  return {
    title: { default: message('brand.title', prefs.locale), template: `%s · ${message('brand.title', prefs.locale)}` },
    description: message('brand.subtitle', prefs.locale),
    // The console is a work surface, not a page: no index, no canonical to the site.
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function ConsoleRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { prefs } = await consoleView();

  return (
    <html
      lang={prefs.locale}
      dir={dirOf(prefs.locale)}
      data-theme={prefs.theme}
      data-surface="console"
      className={`${tajawal.variable}`}
    >
      <body className="console-body">{children}</body>
    </html>
  );
}
