-- 001 auth: users, roles, permissions, sessions, login throttling, approvals.
-- MySQL/MariaDB dialect (the cPanel target). Read docs/LOCAL-MARIADB.md for the local instance.

CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  email_lc VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT '',
  locale VARCHAR(5) NOT NULL DEFAULT 'ar',
  theme VARCHAR(16) NOT NULL DEFAULT 'light',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  totp_secret VARCHAR(255) NULL,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX users_email_lc ON users (email_lc);
CREATE INDEX users_status ON users (status);

CREATE TABLE roles (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  is_owner TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX roles_name ON roles (name);

CREATE TABLE user_roles (
  user_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX user_roles_role ON user_roles (role_id);

-- resource x action x scope. scope NULL means "everything of that resource".
CREATE TABLE role_permissions (
  id CHAR(36) PRIMARY KEY,
  role_id CHAR(36) NOT NULL,
  resource VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL,
  scope JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL
);
CREATE UNIQUE INDEX role_perm_unique ON role_permissions (role_id, resource, action);

CREATE TABLE sessions (
  id CHAR(36) PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  user_id CHAR(36) NOT NULL,
  csrf_hash CHAR(64) NOT NULL,
  ip_hash CHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(400) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL
);
CREATE UNIQUE INDEX sessions_token ON sessions (token_hash);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE login_attempts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email_lc VARCHAR(255) NOT NULL DEFAULT '',
  ip_hash CHAR(64) NOT NULL DEFAULT '',
  success TINYINT(1) NOT NULL,
  attempted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE INDEX login_attempts_window ON login_attempts (ip_hash, attempted_at);
CREATE INDEX login_attempts_email ON login_attempts (email_lc, attempted_at);

-- A user asks for a permission they do not have; the Owner decides.
CREATE TABLE permission_requests (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  resource VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL,
  scope JSON NULL,
  reason VARCHAR(1000) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  requested_days INT NULL,
  decided_by CHAR(36) NULL,
  decided_at DATETIME(3) NULL,
  decision_note VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT NOT NULL DEFAULT 1
);
CREATE INDEX permission_requests_status ON permission_requests (status);

-- A time-boxed grant handed out from the approvals inbox.
CREATE TABLE permission_grants (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  resource VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL,
  scope JSON NULL,
  granted_by CHAR(36) NOT NULL,
  expires_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE INDEX permission_grants_user ON permission_grants (user_id, resource, action);
