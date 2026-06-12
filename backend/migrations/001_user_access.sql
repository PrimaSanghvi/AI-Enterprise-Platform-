-- Login module: tracks each user's 2-hour access window.
-- expires_at is set once on first login and never reset, so once it passes
-- the email is permanently locked out.
CREATE TABLE IF NOT EXISTS ai_platform_db.user_access (
    email      text PRIMARY KEY,
    name       text,
    login_at   timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
);
