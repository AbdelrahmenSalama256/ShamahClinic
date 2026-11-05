import { notFound, redirect } from 'next/navigation';
import { readPageStates } from './page-visibility';
import type { SitePageKey } from './settings-catalog';

/**
 * The one place a public route asks whether the owner has hidden it. A hidden page
 * follows its redirect when one is set and answers the branded 404 otherwise; every
 * detail route passes its listing's key, because hiding `/blogs` hides every article
 * under it.
 */
export async function guardPage(key: SitePageKey): Promise<void> {
  const state = (await readPageStates())[key];
  if (state.enabled) return;
  if (state.redirectTo) redirect(state.redirectTo);
  notFound();
}
