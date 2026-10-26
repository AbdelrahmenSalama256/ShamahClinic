/**
 * The list document contract (slice D).
 *
 * The console, the importer and the public readers agree on one document per list
 * item. These tests hold that contract at its two edges:
 *
 *   - a site object and its document are the same thing written twice, so a service,
 *     branch, specialist, question or menu entry can be imported without losing a
 *     field and read back without inventing one;
 *   - the importer writes the flat `name_ar`/`name_en` keys the console uses to name
 *     a row, and the reader still accepts the nested shape older rows were saved in.
 */
import { describe, expect, it } from 'vitest';
import {
  branchDocOf,
  branchOfDoc,
  faqDocOf,
  faqOfDoc,
  navDocOf,
  navOfDoc,
  serviceDocOf,
  specialistDocOf,
  specialistOfDoc,
  treatmentOfDoc,
} from '../src/lib/content/list-docs';
import { planListDocs } from '../src/lib/content/import-lists';
import { treatmentsFromSite } from '../src/lib/wp/treatments';
import { getSourceBranches } from '../src/lib/content/site';
import { faqData } from '../src/data/faq';
import { navItems } from '../src/data/nav';
import { specialistsData } from '../src/data/specialists';

describe('a site object written as a list document', () => {
  it('keeps every service field through the round trip', async () => {
    const [treatment] = await treatmentsFromSite();
    const doc = serviceDocOf(treatment);
    const back = treatmentOfDoc(doc, treatment.id);
    if (!back) throw new Error('the service document has no name');

    expect(back.name).toEqual(treatment.name);
    expect(back.tagline).toEqual(treatment.tagline);
    expect(back.description).toEqual(treatment.description);
    expect(back.benefits).toEqual(treatment.benefits);
    expect(back.steps).toEqual(treatment.steps);
    expect(back.aftercare).toEqual(treatment.aftercare);
    expect(back.idealFor).toEqual(treatment.idealFor);
    expect(back.duration).toEqual(treatment.duration);
    expect(back.sessionsRecommended).toEqual(treatment.sessionsRecommended);
    expect(back.priceStartingAt).toBe(treatment.priceStartingAt);
    expect(back.image.src).toBe(treatment.image.src);
    expect(back.image.alt).toEqual(treatment.image.alt);
    expect(back.body).toEqual(treatment.body);
    // The key the console prints as the row's title.
    expect(doc.name_ar).toBe(treatment.name.ar);
    expect(doc.name_en).toBe(treatment.name.en);
  });

  it('keeps a branch, including its photo and repeatable features', async () => {
    const [branch] = await getSourceBranches();
    const back = branchOfDoc(branchDocOf(branch), branch.id);
    if (!back) throw new Error('the branch document has no name');

    expect(back.name).toEqual(branch.name);
    expect(back.area).toEqual(branch.area);
    expect(back.address).toEqual(branch.address);
    expect(back.phone).toBe(branch.phone);
    expect(back.image.src).toBe(branch.image.src);
    expect(back.intro).toEqual(branch.intro);
    expect(back.features).toEqual(branch.features);
    expect(back.landmark).toEqual(branch.landmark);
  });

  it('keeps a specialist, the team and the branch links', () => {
    const specialist = specialistsData[0];
    const back = specialistOfDoc(specialistDocOf(specialist), specialist.id);
    if (!back) throw new Error('the specialist document has no name');

    expect(back.name).toEqual(specialist.name);
    expect(back.title).toEqual(specialist.title);
    expect(back.credentials).toEqual(specialist.credentials);
    expect(back.bio).toEqual(specialist.bio);
    expect(back.specialties).toEqual(specialist.specialties);
    expect(back.experienceYears).toBe(specialist.experienceYears);
    expect(back.branches).toEqual(specialist.branches);
    expect(back.image.src).toBe(specialist.image.src);
  });

  it('keeps a question and its category', () => {
    const question = faqData[0];
    const back = faqOfDoc(faqDocOf(question), question.id);
    if (!back) throw new Error('the question document has no question');

    expect(back.question).toEqual(question.question);
    expect(back.answer).toEqual(question.answer);
    expect(back.category).toBe(question.category);
  });

  it('keeps the menu, its order and its children', () => {
    const entry = navItems.find((item) => item.children?.length);
    if (!entry) throw new Error('the menu has no dropdown');
    const back = navOfDoc(navDocOf(entry));
    if (!back) throw new Error('the navigation document has no label');

    expect(back.href).toBe(entry.href);
    expect(back.label).toEqual(entry.label);
    expect(back.children).toEqual(entry.children);
  });
});

describe('a list document an older editor saved', () => {
  it('reads a nested `{ar, en}` pair and a single string as both languages', () => {
    const branch = branchOfDoc(
      {
        name: { ar: 'فرع مدينة نصر', en: 'Nasr City Branch' },
        area: 'مدينة نصر',
        address: { ar: 'شارع مصطفى حمام', en: 'Mustafa Hammam Street' },
        phone: '01000000000',
        features: { ar: ['ليزر', 'بوتوكس'], en: ['Laser', 'Botox'] },
      },
      'nasr',
    );
    if (!branch) throw new Error('the nested branch has no name');
    expect(branch.name).toEqual({ ar: 'فرع مدينة نصر', en: 'Nasr City Branch' });
    // One language written once is the same sentence in the other, not a blank.
    expect(branch.area).toEqual({ ar: 'مدينة نصر', en: 'مدينة نصر' });
    expect(branch.address.en).toBe('Mustafa Hammam Street');
    expect(branch.features).toEqual({ ar: ['ليزر', 'بوتوكس'], en: ['Laser', 'Botox'] });
  });

  it('refuses a row with no name, so the site never prints an empty card', () => {
    expect(branchOfDoc({ phone: '01000000001' }, 'nameless')).toBeNull();
    expect(faqOfDoc({ answer_ar: 'إجابة' }, 'answer-only')).toBeNull();
    expect(navOfDoc({ label_ar: 'بلا رابط' })).toBeNull();
  });
});

describe('the list import plan', () => {
  it('covers every list the site renders, once per row', async () => {
    const plan = await planListDocs();
    const [services, branches] = await Promise.all([treatmentsFromSite(), getSourceBranches()]);

    expect(plan.services).toBe(services.length);
    expect(plan.branches).toBe(branches.length);
    expect(plan.specialists).toBe(specialistsData.length);
    expect(plan.faq).toBe(faqData.length);
    expect(plan.nav).toBe(navItems.length);
    expect(plan.docs).toHaveLength(plan.services + plan.branches + plan.specialists + plan.faq + plan.nav);

    // The snapshot's seven services, not whatever one row the database may hold: the
    // plan reads past the database rung so an import can fill a half-written list.
    expect(services.length).toBeGreaterThan(1);
    const keys = plan.docs.map((doc) => `${doc.listKey}:${doc.key}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(plan.docs.every((doc) => doc.kind === 'list_item' && doc.legacyId.startsWith('list:'))).toBe(true);
  });

  it('writes the flat title key the console names each row by', async () => {
    const plan = await planListDocs();
    const titleKey: Record<string, string> = {
      services: 'name',
      branches: 'name',
      specialists: 'name',
      faq: 'question',
      nav: 'label',
    };
    for (const doc of plan.docs) {
      const data = doc.fields.ar?.data as Record<string, unknown>;
      const stem = titleKey[doc.listKey ?? ''];
      expect(typeof data[`${stem}_ar`]).toBe('string');
      expect(typeof data[`${stem}_en`]).toBe('string');
      // `data` is a document, never a string an editor has to parse.
      expect(doc.fields.ar?.data).toBeTypeOf('object');
    }
  });
});
