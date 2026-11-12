import type { ColumnType, Generated, Kysely } from 'kysely';

/** A `JSON` column: pass `json(value)` when writing, get the value back when reading. See ./json.ts. */
export type Json<T> = ColumnType<T, string, string>;
/** The same, for a column declared `JSON NULL`. */
export type JsonOr<T> = ColumnType<T | null, string | null, string | null>;

/**
 * Column conventions, kept in sync with the SQL by src/lib/db/schema.test.ts:
 *   Generated<T>  the column has a SQL DEFAULT, so an insert may omit it
 *   Json<T>       a JSON column — write with json(), read as a value
 * Nullable columns are already optional on insert, which is why they are plain `T | null`.
 */
/** Columns every stamped row carries. */
interface Stamp {
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
interface Owned extends Stamp {
  created_by: string | null;
  updated_by: string | null;
}
/** Owned rows that can be soft-deleted into Trash and carry an optimistic-lock version. */
interface Editable extends Owned {
  deleted_at: Date | null;
  version: Generated<number>;
}

export interface AppMigrationsTable {
  name: string;
  checksum: string;
  applied_at: Generated<Date>;
}

export interface UsersTable {
  id: string;
  email: string;
  email_lc: string;
  password_hash: string;
  name: Generated<string>;
  locale: Generated<string>;
  theme: Generated<string>;
  status: Generated<'active' | 'invited' | 'disabled'>;
  must_change_password: Generated<0 | 1>;
  totp_secret: string | null;
  last_login_at: Date | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
  version: Generated<number>;
}
export interface RolesTable extends Editable {
  id: string;
  name: string;
  description: Generated<string>;
  is_system: Generated<0 | 1>;
  is_owner: Generated<0 | 1>;
}
export interface UserRolesTable {
  user_id: string;
  role_id: string;
}
/**
 * Per-row narrowing of a permission. `null` means the whole resource;
 * an empty array means none of it.
 */
export type PermissionScope = {
  pages?: string[];
  lists?: string[];
  locales?: string[];
  leadSources?: string[];
};
export interface RolePermissionsTable extends Owned {
  id: string;
  role_id: string;
  resource: string;
  action: string;
  scope: JsonOr<PermissionScope>;
}
export interface SessionsTable {
  id: string;
  token_hash: string;
  user_id: string;
  csrf_hash: string;
  ip_hash: Generated<string>;
  user_agent: Generated<string>;
  created_at: Generated<Date>;
  last_seen_at: Generated<Date>;
  expires_at: Date;
  revoked_at: Date | null;
}
export interface LoginAttemptsTable {
  id: Generated<number>;
  email_lc: Generated<string>;
  ip_hash: Generated<string>;
  success: 0 | 1;
  attempted_at: Generated<Date>;
}
export interface PermissionRequestsTable {
  id: string;
  user_id: string;
  resource: string;
  action: string;
  scope: JsonOr<PermissionScope>;
  reason: Generated<string>;
  status: Generated<'pending' | 'approved' | 'rejected'>;
  requested_days: number | null;
  decided_by: string | null;
  decided_at: Date | null;
  decision_note: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  version: Generated<number>;
}
export interface PermissionGrantsTable {
  id: string;
  user_id: string;
  resource: string;
  action: string;
  scope: JsonOr<PermissionScope>;
  granted_by: string;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Generated<Date>;
}
export interface CategoriesTable extends Editable {
  id: string;
  slug: string;
  name_ar: Generated<string>;
  name_en: Generated<string>;
  position: Generated<number>;
  enabled: Generated<0 | 1>;
}
/**
 * `title_ar`/`title_en`/`content_ar`/`content_en` are the DRAFT an editor is
 * writing; `pub_*` is what the public site reads. See 002_content.sql.
 */
export interface ArticlesTable extends Editable {
  id: string;
  slug: string;
  status: Generated<'draft' | 'published' | 'scheduled' | 'trash'>;
  title_ar: Generated<string>;
  title_en: Generated<string>;
  excerpt_ar: Generated<string>;
  excerpt_en: Generated<string>;
  content_ar: string | null;
  content_en: string | null;
  pub_title_ar: Generated<string>;
  pub_title_en: Generated<string>;
  pub_excerpt_ar: Generated<string>;
  pub_excerpt_en: Generated<string>;
  pub_content_ar: string | null;
  pub_content_en: string | null;
  category_id: string | null;
  image: string | null;
  image_alt_ar: Generated<string>;
  image_alt_en: Generated<string>;
  published_at: Date | null;
  scheduled_at: Date | null;
  legacy_id: string | null;
}
/** An offer's gallery entry. Alt is bilingual because `Offer.images[]` renders in both locales. */
export type OfferImage = { src: string; alt_ar: string; alt_en: string };
export interface OffersTable extends Editable {
  id: string;
  slug: string;
  status: Generated<'draft' | 'published' | 'trash'>;
  name_ar: Generated<string>;
  name_en: Generated<string>;
  excerpt_ar: Generated<string>;
  excerpt_en: Generated<string>;
  body_ar: string | null;
  body_en: string | null;
  pub_name_ar: Generated<string>;
  pub_name_en: Generated<string>;
  pub_excerpt_ar: Generated<string>;
  pub_excerpt_en: Generated<string>;
  pub_body_ar: string | null;
  pub_body_en: string | null;
  price: string | null;
  regular_price: string | null;
  currency: Generated<string>;
  on_sale: Generated<0 | 1>;
  images: JsonOr<OfferImage[]>;
  /** NULL is "never configured", not "all services" — see 012_offer_services.sql */
  applicable_services: JsonOr<string[]>;
  enabled: Generated<0 | 1>;
  /** Cairo calendar day the offer starts being live; null has no boundary */
  starts_at: string | null;
  ends_at: string | null;
  position: Generated<number>;
  published_at: Date | null;
  legacy_id: string | null;
}
export interface PagesTable extends Editable {
  id: string;
  route: string;
  status: Generated<'draft' | 'published' | 'trash'>;
  title_ar: Generated<string>;
  title_en: Generated<string>;
  content_ar: string | null;
  content_en: string | null;
  pub_title_ar: Generated<string>;
  pub_title_en: Generated<string>;
  pub_content_ar: string | null;
  pub_content_en: string | null;
  data: JsonOr<Record<string, unknown>>;
  pub_data: JsonOr<Record<string, unknown>>;
  enabled: Generated<0 | 1>;
  redirect_to: string | null;
  published_at: Date | null;
  legacy_id: string | null;
}
export interface ContentFieldsTable extends Editable {
  id: string;
  field_key: string;
  label: Generated<string>;
  role: Generated<string>;
  route: Generated<string>;
  section_id: Generated<string>;
  default_ar: string | null;
  default_en: string | null;
  draft_ar: string | null;
  draft_en: string | null;
  pub_ar: string | null;
  pub_en: string | null;
  status: Generated<'published' | 'draft' | 'changed'>;
  enabled: Generated<0 | 1>;
  source_file: string | null;
  source_line: number | null;
  orphaned_at: Date | null;
}
/** One authored list row, e.g. `{name:{ar,en}, phone:"…", specialties:{ar:[],en:[]}}`. */
export type ListItemData = Record<string, unknown>;
export interface ListsTable extends Editable {
  id: string;
  list_key: string;
  label: Generated<string>;
  /** The inferred item shape the console builds its form from. */
  item_schema: Json<ListItemData>;
  reorderable: Generated<0 | 1>;
  is_article_collection: Generated<0 | 1>;
}
export interface ListItemsTable extends Editable {
  id: string;
  list_id: string;
  uid: string;
  position: Generated<number>;
  enabled: Generated<0 | 1>;
  draft: Json<ListItemData>;
  published: JsonOr<ListItemData>;
  status: Generated<'draft' | 'published' | 'changed'>;
  published_at: Date | null;
  legacy_id: string | null;
}
export interface SectionStateTable extends Owned {
  id: string;
  route: string;
  section_id: string;
  label: Generated<string>;
  enabled: Generated<0 | 1>;
  position: Generated<number>;
  variant: string | null;
  animation: JsonOr<Record<string, unknown>>;
  publish_at: Date | null;
  unpublish_at: Date | null;
  version: Generated<number>;
}
export interface MediaFoldersTable extends Stamp {
  id: string;
  name: string;
  parent_id: string | null;
}
export interface MediaTable extends Editable {
  id: string;
  path: string;
  filename: string;
  mime: Generated<string>;
  width: Generated<number>;
  height: Generated<number>;
  size_bytes: Generated<number>;
  sha256: Generated<string>;
  alt_ar: Generated<string>;
  alt_en: Generated<string>;
  folder_id: string | null;
  legacy_url: string | null;
}
export interface SeoEntriesTable extends Owned {
  id: string;
  entity_type: string;
  entity_id: Generated<string>;
  locale: string;
  title: Generated<string>;
  description: Generated<string>;
  canonical: string | null;
  robots: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  twitter_card: string | null;
  hreflang: JsonOr<Array<{ locale: string; href: string }>>;
  jsonld: JsonOr<Record<string, unknown> | Array<Record<string, unknown>>>;
  head_tags: JsonOr<Array<Record<string, string>>>;
  draft: Generated<0 | 1>;
  published_at: Date | null;
  version: Generated<number>;
}
export interface RedirectsTable extends Editable {
  id: string;
  source_path: string;
  target_path: string;
  status_code: Generated<number>;
  match_type: Generated<'exact' | 'prefix'>;
  enabled: Generated<0 | 1>;
  hits: Generated<number>;
  note: Generated<string>;
}
export interface NotFoundLogTable {
  id: string;
  path_hash: string;
  path: string;
  referrer: Generated<string>;
  hits: Generated<number>;
  first_seen_at: Generated<Date>;
  last_seen_at: Generated<Date>;
}
export interface CtasTable extends Editable {
  id: string;
  cta_key: string;
  label_ar: Generated<string>;
  label_en: Generated<string>;
  placement: Generated<string>;
  cta_type: Generated<string>;
  target: Generated<string>;
  enabled: Generated<0 | 1>;
  position: Generated<number>;
}
export interface CtaActionsTable extends Stamp {
  id: string;
  cta_id: string;
  position: Generated<number>;
  action_type: string;
  config: Json<Record<string, unknown>>;
}
export interface LeadsTable extends Editable {
  id: string;
  source: Generated<string>;
  form_id: Generated<string>;
  name: Generated<string>;
  phone: Generated<string>;
  email: Generated<string>;
  message: string | null;
  /** Extra form answers the console shows per source. */
  fields: JsonOr<Record<string, unknown>>;
  status: Generated<'new' | 'contacted' | 'booked' | 'done' | 'lost'>;
  assignee_id: string | null;
  locale: Generated<string>;
  page_path: Generated<string>;
  /** 010: where the visit that produced the lead started, and the first page it saw. */
  landing_page: Generated<string>;
  first_referrer: Generated<string>;
  gclid: Generated<string>;
  fbclid: Generated<string>;
  device: Generated<string>;
  utm_source: Generated<string>;
  utm_medium: Generated<string>;
  utm_campaign: Generated<string>;
  utm_term: Generated<string>;
  utm_content: Generated<string>;
  city: Generated<string>;
  /** 011: the Cairo calendar day, written at insert; NULL only on rows older than 011. */
  day: string | null;
  session_hash: string | null;
  visitor_hash: string | null;
  referrer: Generated<string>;
  utm: JsonOr<Record<string, string>>;
  idempotency_key: Generated<string>;
  sheets_sent_at: Date | null;
  spam: Generated<0 | 1>;
}
export interface LeadNotesTable {
  id: string;
  lead_id: string;
  author_id: string;
  body: string;
  created_at: Generated<Date>;
}
export interface IntegrationsTable extends Editable {
  id: string;
  kind: string;
  name: Generated<string>;
  config: Json<Record<string, unknown>>;
  enabled: Generated<0 | 1>;
  schema_hash: Generated<string>;
  last_error: string | null;
}
export interface OutboxTable extends Stamp {
  id: string;
  kind: string;
  payload: Json<Record<string, unknown>>;
  attempts: Generated<number>;
  next_attempt_at: Generated<Date>;
  sent_at: Date | null;
  last_error: string | null;
}
export interface NotificationsTable {
  id: string;
  user_id: string | null;
  kind: string;
  title: Generated<string>;
  body: Generated<string>;
  entity_type: string | null;
  entity_id: string | null;
  read_at: Date | null;
  created_at: Generated<Date>;
}
export interface JobsTable extends Stamp {
  id: string;
  kind: string;
  payload: Json<Record<string, unknown>>;
  status: Generated<'queued' | 'running' | 'done' | 'failed'>;
  run_at: Generated<Date>;
  finished_at: Date | null;
  error: string | null;
}
export interface RevisionsTable {
  id: string;
  entity_type: string;
  entity_id: string;
  revision: number;
  snapshot: Json<Record<string, unknown>>;
  author_id: string | null;
  author_email: Generated<string>;
  note: Generated<string>;
  created_at: Generated<Date>;
}
export interface SnapshotsTable {
  id: string;
  label: Generated<string>;
  kind: Generated<string>;
  payload: Buffer;
  payload_bytes: Generated<number>;
  entity_count: Generated<number>;
  is_current: Generated<0 | 1>;
  created_at: Generated<Date>;
  created_by: string | null;
}
export interface SettingsTable extends Stamp {
  group_name: string;
  setting_key: string;
  value: Json<unknown>;
  default_value: JsonOr<unknown>;
  is_secret: Generated<0 | 1>;
  updated_by: string | null;
  version: Generated<number>;
}
export interface ThemeTokensTable extends Stamp {
  token: string;
  label: Generated<string>;
  group_name: Generated<string>;
  light_value: Generated<string>;
  dark_value: Generated<string>;
  source_value: Generated<string>;
  updated_by: string | null;
  version: Generated<number>;
}
export interface AuditLogTable {
  id: Generated<number>;
  actor_id: string | null;
  actor_email: Generated<string>;
  actor_kind: Generated<string>;
  action: string;
  entity_type: Generated<string>;
  entity_id: Generated<string>;
  before_json: JsonOr<Record<string, unknown>>;
  after_json: JsonOr<Record<string, unknown>>;
  ip_hash: Generated<string>;
  request_id: Generated<string>;
  created_at: Generated<Date>;
}
export interface StatsEventsTable {
  id: Generated<number>;
  day: string;
  /** 011: the Cairo clock hour, so a day-by-hour heatmap needs no SQL timezone math. */
  hour: number | null;
  event_type: Generated<string>;
  path: string;
  locale: Generated<string>;
  referrer_host: Generated<string>;
  /** 010: the campaign this page view arrived on, and the landing page of the visit. */
  utm_source: Generated<string>;
  utm_medium: Generated<string>;
  utm_campaign: Generated<string>;
  utm_term: Generated<string>;
  utm_content: Generated<string>;
  gclid: Generated<string>;
  fbclid: Generated<string>;
  landing: Generated<string>;
  session_hash: string | null;
  city: Generated<string>;
  meta: JsonOr<Record<string, string>>;
  device: Generated<string>;
  cta_key: Generated<string>;
  visitor_hash: string | null;
  bot: Generated<0 | 1>;
  created_at: Generated<Date>;
}
export interface StatsDailyTable {
  day: string;
  path: string;
  locale: Generated<string>;
  views: Generated<number>;
  visitors: Generated<number>;
}
export interface StatsReferrersDailyTable {
  day: string;
  host: string;
  views: Generated<number>;
  visitors: Generated<number>;
}
export interface StatsCtaDailyTable {
  day: string;
  cta_key: string;
  clicks: Generated<number>;
}
/** 010: named events per day, with distinct sessions beside the count. */
export interface StatsNamedDailyTable {
  day: string;
  event_type: string;
  events: Generated<number>;
  sessions: Generated<number>;
}
/** 010: campaign traffic per day; '' in every source column is Direct. */
export interface StatsSourcesDailyTable {
  day: string;
  source: Generated<string>;
  medium: Generated<string>;
  campaign: Generated<string>;
  views: Generated<number>;
  visitors: Generated<number>;
}
/** 010: city per day, filled only when a trusted proxy names one. */
export interface StatsGeoDailyTable {
  day: string;
  city: Generated<string>;
  views: Generated<number>;
  visitors: Generated<number>;
}
export interface StatsRollupStateTable {
  id: number;
  last_event_id: Generated<number>;
  last_run_at: Date | null;
  updated_at: Generated<Date>;
}
/** 009: one frame of the homepage slider. No draft/pub pair: `active` and a schedule replace publishing. */
export interface HeroSlidesTable extends Editable {
  id: string;
  position: Generated<number>;
  active: Generated<0 | 1>;
  image: string;
  image_mobile: string | null;
  alt_ar: Generated<string>;
  alt_en: Generated<string>;
  heading_ar: string | null;
  heading_en: string | null;
  sub_ar: string | null;
  sub_en: string | null;
  cta_label_ar: string | null;
  cta_label_en: string | null;
  cta_href_ar: string | null;
  cta_href_en: string | null;
  starts_at: Date | null;
  ends_at: Date | null;
}
/** 009: the slider's behaviour. One row, id = 1. */
/**
 * 009: the settings row. Unlike every other stamped row it has no `created_at` — the row
 * is seeded by the migration itself, so the moment of creation is the migration's, and a
 * second timestamp nothing reads would only be one more column to keep in sync.
 */
export interface HeroSettingsTable {
  id: number;
  autoplay: Generated<0 | 1>;
  interval_ms: Generated<number>;
  fade_ms: Generated<number>;
  pause_on_hover: Generated<0 | 1>;
  dots: Generated<0 | 1>;
  arrows: Generated<0 | 1>;
  looping: Generated<0 | 1>;
  updated_by: string | null;
  updated_at: Generated<Date>;
  version: Generated<number>;
}
/** 007: one person's saved list filter — a name on the query string that drew it. */
export interface ConsoleViewsTable {
  id: string;
  user_id: string;
  kind: string;
  name: string;
  query: string;
  position: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
  version: Generated<number>;
}

// --- mobile app (018) -------------------------------------------------------

export interface AppCustomersTable {
  id: string;
  code: string;
  first_name: Generated<string>;
  second_name: Generated<string>;
  phone: string;
  email: Generated<string>;
  password_hash: string;
  image_url: Generated<string>;
  push_token: Generated<string>;
  locale: Generated<string>;
  blocked: Generated<number>;
  last_login_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface AppTokensTable {
  id: string;
  customer_id: string;
  token_hash: string;
  user_agent: Generated<string>;
  created_at: Generated<Date>;
  last_used_at: Date | null;
  expires_at: Date;
  revoked_at: Date | null;
}

export interface AppBookingsTable {
  id: string;
  code: string;
  customer_id: string;
  branch_uid: string;
  service_uid: Generated<string>;
  service_name_ar: Generated<string>;
  service_name_en: Generated<string>;
  start_at: Date;
  end_at: Date | null;
  status: Generated<number>;
  price: string | null;
  clinic_note: Generated<string>;
  lead_id: string | null;
  points_awarded: Generated<number>;
  cancelled_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  updated_by: string | null;
}

export interface AppFavouritesTable {
  customer_id: string;
  product_id: string;
  created_at: Generated<Date>;
}

export interface AppAddressesTable {
  id: string;
  customer_id: string;
  client_name: Generated<string>;
  street_name: Generated<string>;
  building_number: Generated<string>;
  floor: Generated<string>;
  apartment_number: Generated<string>;
  phone: Generated<string>;
  extra_info: Generated<string>;
  latitude: string | null;
  longitude: string | null;
  fav: Generated<number>;
  created_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface AppLoyaltyTable {
  id: string;
  customer_id: string;
  type: Generated<number>;
  cat: Generated<number>;
  points: number;
  amount_spent: string | null;
  booking_id: string | null;
  note: Generated<string>;
  created_by: string | null;
  created_at: Generated<Date>;
}

/** No index signature: `extends Record<string, unknown>` makes Kysely's `keyof Database`
 * collapse to `string` and every qualified join reference infer as `never`. */
export interface Database {
  app_migrations: AppMigrationsTable;
  users: UsersTable;
  roles: RolesTable;
  user_roles: UserRolesTable;
  role_permissions: RolePermissionsTable;
  sessions: SessionsTable;
  login_attempts: LoginAttemptsTable;
  permission_requests: PermissionRequestsTable;
  permission_grants: PermissionGrantsTable;
  categories: CategoriesTable;
  articles: ArticlesTable;
  offers: OffersTable;
  pages: PagesTable;
  content_fields: ContentFieldsTable;
  lists: ListsTable;
  list_items: ListItemsTable;
  section_state: SectionStateTable;
  media_folders: MediaFoldersTable;
  media: MediaTable;
  seo_entries: SeoEntriesTable;
  redirects: RedirectsTable;
  not_found_log: NotFoundLogTable;
  ctas: CtasTable;
  cta_actions: CtaActionsTable;
  leads: LeadsTable;
  lead_notes: LeadNotesTable;
  integrations: IntegrationsTable;
  outbox: OutboxTable;
  notifications: NotificationsTable;
  jobs: JobsTable;
  revisions: RevisionsTable;
  snapshots: SnapshotsTable;
  settings: SettingsTable;
  theme_tokens: ThemeTokensTable;
  audit_log: AuditLogTable;
  stats_events: StatsEventsTable;
  stats_daily: StatsDailyTable;
  stats_referrers_daily: StatsReferrersDailyTable;
  stats_cta_daily: StatsCtaDailyTable;
  stats_named_daily: StatsNamedDailyTable;
  stats_sources_daily: StatsSourcesDailyTable;
  stats_geo_daily: StatsGeoDailyTable;
  stats_rollup_state: StatsRollupStateTable;
  hero_slides: HeroSlidesTable;
  hero_settings: HeroSettingsTable;
  console_views: ConsoleViewsTable;
  app_customers: AppCustomersTable;
  app_tokens: AppTokensTable;
  app_bookings: AppBookingsTable;
  app_favourites: AppFavouritesTable;
  app_addresses: AppAddressesTable;
  app_loyalty: AppLoyaltyTable;
}

export type Db = Kysely<Database>;
