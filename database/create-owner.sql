-- Add the requested initial Owner account to an existing CMS database.
-- Safe to run repeatedly: an existing account keeps its password, but receives the Owner role.
SET NAMES utf8mb4;
-- Add the requested initial Owner account; password is stored as a bcrypt hash.
START TRANSACTION;
INSERT IGNORE INTO users (id, email, email_lc, password_hash, name, locale, status, must_change_password)
VALUES (UUID(), 'owner@newshamah.shamahclinics.com', LOWER(TRIM('owner@newshamah.shamahclinics.com')), '$2b$12$vfkhmt.yWoFesfOh.p8F.eiWVk2zvWclOszPewCdVMb.dgpwXkA86', 'Site Owner', 'en', 'active', 0);
INSERT IGNORE INTO user_roles (user_id, role_id)
SELECT users.id, roles.id FROM users JOIN roles ON roles.name = 'Owner'
WHERE users.email_lc = LOWER(TRIM('owner@newshamah.shamahclinics.com'));
COMMIT;
SELECT users.email, roles.name AS role, roles.is_owner
FROM users
JOIN user_roles ON user_roles.user_id = users.id
JOIN roles ON roles.id = user_roles.role_id
WHERE users.email_lc = LOWER(TRIM('owner@newshamah.shamahclinics.com'))
  AND roles.name = 'Owner';
