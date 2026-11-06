-- Add the requested initial Owner account to an existing CMS database.
-- Safe to run once: an existing account with this email is not changed.
SET NAMES utf8mb4;
-- Initial Owner account; password is stored as a bcrypt hash.
SET @owner_email = 'owner@newshamah.shamahclinics.com';
SET @owner_name = 'Site Owner';
SET @owner_password_hash = '$2b$12$vfkhmt.yWoFesfOh.p8F.eiWVk2zvWclOszPewCdVMb.dgpwXkA86';
SET @owner_id = NULL;
INSERT INTO users (id, email, email_lc, password_hash, name, locale, status, must_change_password)
SELECT @owner_id := UUID(), @owner_email, LOWER(TRIM(@owner_email)), @owner_password_hash, @owner_name, 'en', 'active', 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email_lc = LOWER(TRIM(@owner_email)));
INSERT IGNORE INTO user_roles (user_id, role_id)
SELECT @owner_id, id FROM roles WHERE name = 'Owner' AND @owner_id IS NOT NULL;
