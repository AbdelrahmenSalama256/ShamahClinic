-- Add the requested initial Owner account to an existing CMS database.
-- Safe to run once: an existing account with this email is not changed.
SET NAMES utf8mb4;
-- Add the requested initial Owner account; password is stored as a bcrypt hash.
START TRANSACTION;
INSERT IGNORE INTO users (id, email, email_lc, password_hash, name, locale, status, must_change_password)
VALUES (UUID(), 'owner@newshamah.shamahclinics.com', LOWER(TRIM('owner@newshamah.shamahclinics.com')), '$2b$12$vfkhmt.yWoFesfOh.p8F.eiWVk2zvWclOszPewCdVMb.dgpwXkA86', 'Site Owner', 'en', 'active', 0);
SET @owner_created = ROW_COUNT();
INSERT IGNORE INTO user_roles (user_id, role_id)
SELECT users.id, roles.id FROM users JOIN roles ON roles.name = 'Owner'
WHERE users.email_lc = LOWER(TRIM('owner@newshamah.shamahclinics.com')) AND @owner_created = 1;
COMMIT;
SELECT IF(@owner_created = 1, 'Owner account created.', 'Account already exists; no account or role was changed.') AS result;
