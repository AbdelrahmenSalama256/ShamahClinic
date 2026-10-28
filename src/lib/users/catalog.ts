/**
 * The permission catalog, in words a person reads.
 *
 * `permissions.ts` is the universe a grant may name; this file is that universe with
 * human labels, grouped the way the screens are. The roles editor renders straight off
 * these maps, so a resource added to the catalog without a label is a type error here
 * rather than a raw `article.publish` on a checkbox.
 *
 * Scope dimensions are offered only where the catalog actually scopes: `locales` and
 * `lists`. `pages` and `leadSources` are real dimensions in `PermissionScope`, but no
 * seeded role narrows them and no consumer reads them yet — a picker over an empty list
 * would teach the operator a control that does nothing.
 */
import type { Action, Resource } from '../auth/permissions';
import { LIST_KEYS } from '../auth/roles';
import type { ConsoleLocale } from '../console/prefs';
import { LIST_LABELS, type ListKey } from '../content/lists';

type Words = Readonly<Record<ConsoleLocale, string>>;

export const RESOURCE_LABELS: Readonly<Record<Resource, Words>> = {
  self: { ar: 'حسابك', en: 'Your account' },
  article: { ar: 'المقالات', en: 'Articles' },
  offer: { ar: 'العروض', en: 'Offers' },
  page: { ar: 'الصفحات', en: 'Pages' },
  list: { ar: 'القوائم', en: 'Lists' },
  setting: { ar: 'إعدادات الموقع', en: 'Site settings' },
  seo: { ar: 'الظهور في البحث', en: 'SEO' },
  redirect: { ar: 'التحويلات', en: 'Redirects' },
  media: { ar: 'الصور', en: 'Media' },
  lead: { ar: 'العملاء المحتملون', en: 'Leads' },
  cta: { ar: 'أزرار الدعوة', en: 'Calls to action' },
  stat: { ar: 'الإحصارات', en: 'Statistics' },
  user: { ar: 'الحسابات', en: 'Accounts' },
  role: { ar: 'الأدوار', en: 'Roles' },
  integration: { ar: 'التسويق والتكاملات', en: 'Marketing & integrations' },
  permission_request: { ar: 'طلبات الصلاحيات', en: 'Permission requests' },
  audit: { ar: 'سجل التغييرات', en: 'Audit log' },
};

export const ACTION_LABELS: Readonly<Record<Action, Words>> = {
  read: { ar: 'قراءة', en: 'Read' },
  create: { ar: 'إنشاء', en: 'Create' },
  update: { ar: 'تعديل', en: 'Update' },
  delete: { ar: 'حذف', en: 'Delete' },
  publish: { ar: 'نشر', en: 'Publish' },
  export: { ar: 'تصدير', en: 'Export' },
};

export type ResourceGroup = 'content' | 'marketing' | 'site';

/** The order the roles editor prints, and the heading each block sits under. */
export const RESOURCE_GROUPS: readonly { key: ResourceGroup; label: Words; resources: readonly Resource[] }[] = [
  {
    key: 'content',
    label: { ar: 'المحتوى', en: 'Content' },
    resources: ['article', 'offer', 'page', 'list', 'media', 'seo', 'redirect'],
  },
  {
    key: 'marketing',
    label: { ar: 'التسويق', en: 'Marketing' },
    resources: ['lead', 'cta', 'stat'],
  },
  {
    key: 'site',
    label: { ar: 'الموقع والحسابات', en: 'Site and accounts' },
    resources: ['setting', 'user', 'role', 'permission_request', 'audit'],
  },
];

/** A scope checkbox list, named by the dimension it narrows. */
export interface ScopeChoice {
  key: 'locales' | 'lists';
  label: Words;
  options: readonly { value: string; label: Words }[];
}

export const SCOPE_CHOICES: readonly ScopeChoice[] = [
  {
    key: 'locales',
    label: { ar: 'اللغات', en: 'Languages' },
    options: [
      { value: 'ar', label: { ar: 'العربية', en: 'Arabic' } },
      { value: 'en', label: { ar: 'English', en: 'English' } },
    ],
  },
  {
    key: 'lists',
    label: { ar: 'القوائم', en: 'Lists' },
    options: LIST_KEYS.map((key: ListKey) => ({
      value: key,
      label: { ar: LIST_LABELS[key]?.ar ?? key, en: LIST_LABELS[key]?.en ?? key },
    })),
  },
];

export function resourceWord(resource: Resource, locale: ConsoleLocale): string {
  return RESOURCE_LABELS[resource][locale];
}

export function actionWord(action: Action, locale: ConsoleLocale): string {
  return ACTION_LABELS[action][locale];
}

/** The matrix's rows and columns, resolved into one language for the browser. */
export interface PermissionCatalog {
  groups: readonly { key: ResourceGroup; label: string; resources: readonly { key: Resource; label: string }[] }[];
  actions: readonly { key: Action; label: string }[];
  scopes: readonly { key: ScopeChoice['key']; label: string; options: readonly { value: string; label: string }[] }[];
}

/**
 * The catalog as the roles editor draws it. Resolved on the server and passed down, so
 * the browser never imports `roles.ts` (which pulls a database client with it) and a
 * language switch is a server render rather than a second copy of these maps.
 */
export function permissionCatalog(locale: ConsoleLocale): PermissionCatalog {
  return {
    groups: RESOURCE_GROUPS.map((group) => ({
      key: group.key,
      label: group.label[locale],
      resources: group.resources.map((resource) => ({ key: resource, label: resourceWord(resource, locale) })),
    })),
    actions: (Object.keys(ACTION_LABELS) as Action[]).map((action) => ({ key: action, label: actionWord(action, locale) })),
    scopes: SCOPE_CHOICES.map((scope) => ({
      key: scope.key,
      label: scope.label[locale],
      options: scope.options.map((option) => ({ value: option.value, label: option.label[locale] })),
    })),
  };
}
