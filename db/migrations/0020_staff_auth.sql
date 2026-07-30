-- Login + MFA + brute-force lockout for staff (FR-SEC-008/009). Reuses the
-- existing staff.is_active as the single "can this account do anything"
-- switch — checked fresh from the DB on every authenticated request, which
-- is what makes deactivation take effect immediately without a separate
-- session-revocation table (see app/core/auth.py).

alter table staff
  add column password_hash text,
  add column mfa_enabled boolean not null default false,
  add column mfa_secret_encrypted text,
  add column failed_login_attempts int not null default 0,
  add column locked_until timestamptz,
  add column last_login_at timestamptz,
  add column deactivated_at timestamptz;
