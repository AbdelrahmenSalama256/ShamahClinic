/**
 * The site's repeatable lists, turned into console rows.
 *
 * The console's service/branch/specialist/question/navigation screens were empty because
 * those lists had never been written: the site rendered static files and the WordPress
 * snapshot while the database held only the result stories. This plan reads the very same
 * sources the site renders today — the seven services on `/services`, the branches, and
 * the authored specialists, questions and menu — and turns each into one list item, so
 * the first time an operator opens Services it is full of the services the public site
 * already shows.
 *
 * It reads those sources, never the database rung. A list is served wholly from the
 * database once anything in it is published, so an importer that asked the site's reader
 * would see one saved row and import that row back instead of the rest of the list.
 *
 * The document each row carries is the contract in `list-docs.ts`; the keys there are the
 * ones the console prints as a title (`name_ar`, `question_ar`, `label_ar`), so an imported
 * row has a human name in the list and not a number.
 */
import { getSourceBranches, getSourceFaq, getSourceNav, getSourceSpecialists } from './site';
import { treatmentsFromSite } from '../wp/treatments';
import { branchDocOf, faqDocOf, navDocOf, serviceDocOf, specialistDocOf } from './list-docs';
import type { ImportDoc } from './import-wp';

export interface ListPlanReport {
  services: number;
  branches: number;
  specialists: number;
  faq: number;
  nav: number;
  docs: ImportDoc[];
}

function item(listKey: string, key: string, position: number, data: Record<string, unknown>, at: Date): ImportDoc {
  return {
    kind: 'list_item',
    listKey,
    key,
    legacyId: `list:${listKey}:${key}`,
    at,
    fields: { ar: { data, enabled: true, position } },
  };
}

function navKey(href: string): string {
  return href.replace(/^\/+|\/+$/g, '').replace(/\//g, '-') || 'home';
}

export async function planListDocs(): Promise<ListPlanReport> {
  const at = new Date();
  // The source rung, never the database: a list that already holds one saved row is
  // served wholly from the database, and reading it here would import that row back
  // instead of the rest of the site.
  const [services, branches] = await Promise.all([treatmentsFromSite(), getSourceBranches()]);
  const specialistSource = getSourceSpecialists();
  const faqSource = getSourceFaq();
  const navSource = getSourceNav();

  const serviceDocs = services.map((treatment, index) => item('services', treatment.id, index, serviceDocOf(treatment), at));
  const branchDocs = branches.map((branch, index) => item('branches', branch.id, index, branchDocOf(branch), at));
  const specialistDocs = specialistSource.map((specialist, index) => item('specialists', specialist.id, index, specialistDocOf(specialist), at));
  const faqDocs = faqSource.map((question, index) => item('faq', question.id, index, faqDocOf(question), at));
  const navDocs = navSource.map((entry, index) => item('nav', navKey(entry.href), index, navDocOf(entry), at));

  return {
    services: serviceDocs.length,
    branches: branchDocs.length,
    specialists: specialistDocs.length,
    faq: faqDocs.length,
    nav: navDocs.length,
    docs: [...serviceDocs, ...branchDocs, ...specialistDocs, ...faqDocs, ...navDocs],
  };
}
