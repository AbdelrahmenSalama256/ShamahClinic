-- 011 overview: the two facts the Overview screen cannot derive from what was stored.
--
-- `leads.created_at` is the database server's clock, and `stats_events.created_at` its
-- DATETIME. Neither carries a timezone, and the clinic reads a day as Cairo's, so a
-- report that grouped either by `DATE(created_at)` would file three hours of every
-- evening under the wrong day. The app already computes the Cairo calendar day for
-- events (`dayOf`); the leads table now keeps it in its own column, and the event row
-- keeps the Cairo clock hour so a day-by-hour heatmap needs no timezone arithmetic in
-- SQL (MariaDB's named-zone tables are not guaranteed to be loaded on a cPanel host).
--
-- Both columns are written by the application from 011 on. A row that predates it has
-- NULL here, and every read says so rather than guessing: a lead's day falls back to
-- `DATE(created_at)` in that case, and an event without an hour is left out of the
-- heatmap instead of being filed under midnight.

ALTER TABLE leads
  -- Cairo calendar day the submission arrived on (YYYY-MM-DD).
  ADD COLUMN day DATE NULL AFTER city;

CREATE INDEX leads_day ON leads (day, created_at);

ALTER TABLE stats_events
  -- Cairo clock hour, 0–23.
  ADD COLUMN hour TINYINT UNSIGNED NULL AFTER day;

-- A heatmap reads one range of days and groups by hour; `stats_events_day_type` cannot
-- answer it because it never stores the hour.
CREATE INDEX stats_events_hour ON stats_events (day, hour);
