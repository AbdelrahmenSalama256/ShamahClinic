# Create the first Owner with phpMyAdmin

This method is for a database that already has the CMS schema. It does not need
`owner:create` or database terminal access.

## Generate the password hash locally

From the project folder on your own computer, run:

```sh
npx tsx scripts/db/hash-owner-password.ts
```

Enter and confirm the new password at the hidden prompt. The command prints only its
bcrypt hash; it does not connect to the database or save the password. Choose a password
of at least 12 characters containing a letter and a digit.

## Run the SQL in phpMyAdmin

Select the application database, open **SQL**, and run the following after replacing
the three values. Use the complete bcrypt hash printed by the local command; do not put
the plaintext password in SQL. Keep the quotes and escape any apostrophes in the email
or name by doubling them.

```sql
START TRANSACTION;

SET @owner_email = 'owner@example.com';
SET @owner_name = 'Clinic Owner';
SET @owner_password_hash = '$2b$12$REPLACE_WITH_THE_LOCALLY_GENERATED_BCRYPT_HASH';
SET @owner_id = NULL;

INSERT INTO roles (id, name, description, is_system, is_owner)
VALUES (UUID(), 'Owner', 'Everything, including other accounts and roles.', 1, 1)
ON DUPLICATE KEY UPDATE name = 'Owner';

UPDATE roles
SET description = 'Everything, including other accounts and roles.',
    is_system = 1,
    is_owner = 1,
    deleted_at = NULL
WHERE name = 'Owner';

SET @owner_role_id = (SELECT id FROM roles WHERE name = 'Owner' LIMIT 1);

INSERT INTO role_permissions (id, role_id, resource, action, scope)
SELECT UUID(), @owner_role_id, '*', '*', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions
  WHERE role_id = @owner_role_id AND resource = '*' AND action = '*'
);

INSERT INTO users (
  id, email, email_lc, password_hash, name, locale, status, must_change_password
)
SELECT @owner_id := UUID(), @owner_email, LOWER(TRIM(@owner_email)),
       @owner_password_hash, @owner_name, 'en', 'active', 0
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE email_lc = LOWER(TRIM(@owner_email))
);

INSERT IGNORE INTO user_roles (user_id, role_id)
SELECT @owner_id, @owner_role_id
WHERE @owner_id IS NOT NULL;

COMMIT;

SELECT IF(
  @owner_id IS NULL,
  'No user created: that email already exists. No existing account was changed.',
  CONCAT('Owner created: ', @owner_email)
) AS result;
```

The SQL will not promote or modify an existing account if the email is already in use.
Sign in at `/console/login` with the email and the password used to generate the hash.
Remove the hash from your clipboard/history when finished.
