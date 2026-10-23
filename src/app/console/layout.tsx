import type { Metadata, Viewport } from 'next';
import { tajawal } from '@/lib/fonts';
import { siteConfig, siteTheme } from '@/config/site';
import { dirOf } from '@/lib/console/prefs';
import { message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
import '../globals.css';
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
      data-density={prefs.density}
      data-surface="console"
      className={`${tajawal.variable}`}
      style={(prefs.theme === 'dark' ? siteTheme.dark : siteTheme.light) as React.CSSProperties}
    >
      <body className="console-body">{children}</body>
    </html>
  );
}
