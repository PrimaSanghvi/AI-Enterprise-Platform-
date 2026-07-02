-- Email+OTP login: domains that skip OTP and get a session immediately, and
-- the one-time codes issued to everyone else. See gateway/otp.py and
-- backend/connectors/user_access.py.
CREATE TABLE IF NOT EXISTS ai_platform_db.whitelisted_domains (
    domain text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS ai_platform_db.otp_tokens (
    email      text NOT NULL,
    token      text NOT NULL,
    expires_at timestamptz NOT NULL,
    attempts   int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_tokens_email_idx ON ai_platform_db.otp_tokens (email);
