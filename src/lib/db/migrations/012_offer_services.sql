-- 012 offer↔services: which services an offer may be booked through, and when it is live.
--
-- `applicable_services` is tri-state on purpose. NULL is not the same as []:
--
--   NULL          the offer predates this column (the WordPress import); nothing is
--                 claimed about it, and the console says "Not configured" rather than
--                 guessing "All services"
--   []            the owner answered "No services linked" explicitly
--   ["*"]         the owner answered "All services" explicitly
--   ["<uid>", …]  the selected service list-item uids, in the order they picked
--
-- A reader must not treat NULL as "all": the difference between "unknown" and "every
-- service" is exactly what the console shows the owner and what the booking path
-- records on the lead. `src/lib/content/offer-services.ts` is the one place that reads
-- this column, so the console, the public site and the lead route agree.
--
-- `starts_at` / `ends_at` are Cairo calendar days (DATE, no time). An offer is live on
-- day D when (starts_at IS NULL OR starts_at <= D) AND (ends_at IS NULL OR ends_at >= D).
-- NULL means "no boundary", which is what every existing row gets — no date is invented
-- for an offer that never carried one.

ALTER TABLE offers
  ADD COLUMN applicable_services JSON NULL AFTER images,
  ADD COLUMN starts_at DATE NULL AFTER enabled,
  ADD COLUMN ends_at DATE NULL AFTER starts_at;

-- The offers list filters on visibility; the public read also has to answer "is this
-- offer inside its window on this day?" without walking the table.
CREATE INDEX offers_live ON offers (enabled, starts_at, ends_at);
