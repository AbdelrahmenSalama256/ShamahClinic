-- 010 tracking: what the lead already knew, and the aggregates that make it readable.
--
-- The leads table has carried `utm`, `referrer` and `page_path` since 004, but the two
-- campaign click ids, the landing page, the device and the city had nowhere to go, so a
-- Google Ads lead and a direct one were the same row to every report. 006 built the
-- event store and the rollup tables but nothing ever wrote them.
--
-- Attribution is first-party and cookieless. The browser keeps the first campaign it
-- arrived on in localStorage (400 days) and a random session id in sessionStorage;
-- nothing is set as a cookie, no IP or user agent is stored, and a request that sends
-- DNT or Sec-GPC is not recorded at all. A visitor is a keyed hash that rotates every
-- day, so "returned tomorrow" is not a fact this table can hold.
--
-- Nothing is backfilled. A row written before this migration has empty campaign columns
-- and empty `referrer`, and every read calls that Direct / Unknown rather than guessing:
-- inventing a source for a historical lead would be worse than admitting there was one.

ALTER TABLE leads
  ADD COLUMN landing_page VARCHAR(512) NOT NULL DEFAULT '' AFTER page_path,
  ADD COLUMN first_referrer VARCHAR(512) NOT NULL DEFAULT '' AFTER landing_page,
  ADD COLUMN gclid VARCHAR(255) NOT NULL DEFAULT '' AFTER first_referrer,
  ADD COLUMN fbclid VARCHAR(255) NOT NULL DEFAULT '' AFTER gclid,
  ADD COLUMN device VARCHAR(16) NOT NULL DEFAULT 'unknown' AFTER fbclid,
  ADD COLUMN utm_source VARCHAR(191) NOT NULL DEFAULT '' AFTER device,
  ADD COLUMN utm_medium VARCHAR(191) NOT NULL DEFAULT '' AFTER utm_source,
  ADD COLUMN utm_campaign VARCHAR(191) NOT NULL DEFAULT '' AFTER utm_medium,
  ADD COLUMN utm_term VARCHAR(191) NOT NULL DEFAULT '' AFTER utm_campaign,
  ADD COLUMN utm_content VARCHAR(191) NOT NULL DEFAULT '' AFTER utm_term,
  ADD COLUMN city VARCHAR(96) NOT NULL DEFAULT '' AFTER utm_content,
  -- Both are one-way hashes (visitor rotates daily, session identifies the tab), never
  -- the raw address or a client id a third party could recognise.
  ADD COLUMN session_hash CHAR(64) NULL AFTER city,
  ADD COLUMN visitor_hash CHAR(64) NULL AFTER session_hash;

CREATE INDEX leads_campaign ON leads (utm_source, created_at);
CREATE INDEX leads_gclid ON leads (gclid);

ALTER TABLE stats_events
  ADD COLUMN utm_source VARCHAR(191) NOT NULL DEFAULT '' AFTER referrer_host,
  ADD COLUMN utm_medium VARCHAR(191) NOT NULL DEFAULT '' AFTER utm_source,
  ADD COLUMN utm_campaign VARCHAR(191) NOT NULL DEFAULT '' AFTER utm_medium,
  ADD COLUMN utm_term VARCHAR(191) NOT NULL DEFAULT '' AFTER utm_campaign,
  ADD COLUMN utm_content VARCHAR(191) NOT NULL DEFAULT '' AFTER utm_term,
  ADD COLUMN gclid VARCHAR(255) NOT NULL DEFAULT '' AFTER utm_content,
  ADD COLUMN fbclid VARCHAR(255) NOT NULL DEFAULT '' AFTER gclid,
  ADD COLUMN landing VARCHAR(512) NOT NULL DEFAULT '' AFTER fbclid,
  ADD COLUMN session_hash CHAR(64) NULL AFTER landing,
  ADD COLUMN city VARCHAR(96) NOT NULL DEFAULT '' AFTER session_hash,
  -- The event's own detail: a CTA key, a nav label, the question a person opened, the
  -- slug they viewed. Values are capped at 120 characters on the way in.
  ADD COLUMN meta JSON NULL AFTER city;

CREATE INDEX stats_events_source ON stats_events (day, utm_source);
CREATE INDEX stats_events_session ON stats_events (session_hash);

-- Where a named event landed per day. `sessions` counts distinct session hashes, so a
-- conversion rate is conversions over sessions, not over page views.
CREATE TABLE stats_named_daily (
  day DATE NOT NULL,
  event_type VARCHAR(24) NOT NULL,
  events BIGINT NOT NULL DEFAULT 0,
  sessions BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event_type)
);

-- Traffic by campaign, which is what a marketing screen asks first. Trailing columns
-- are part of the key so the pair (day, source) is still a prefix scan.
CREATE TABLE stats_sources_daily (
  day DATE NOT NULL,
  source VARCHAR(96) NOT NULL DEFAULT '',
  medium VARCHAR(96) NOT NULL DEFAULT '',
  campaign VARCHAR(128) NOT NULL DEFAULT '',
  views BIGINT NOT NULL DEFAULT 0,
  visitors BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, source, medium, campaign)
);

-- Cities, when a proxy in front of the app names one (Cloudflare's `cf-ipcity`, a Vercel
-- `x-vercel-ip-city`). With no proxy every row is '', and every screen calls that Unknown
-- instead of hiding the panel. No geo lookup service is called and no IP is stored.
CREATE TABLE stats_geo_daily (
  day DATE NOT NULL,
  city VARCHAR(96) NOT NULL DEFAULT '',
  views BIGINT NOT NULL DEFAULT 0,
  visitors BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, city)
);
