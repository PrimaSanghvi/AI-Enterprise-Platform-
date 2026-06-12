-- Add a role to user_access so policy-rule mutations can be restricted.
-- Roles mirror backend/connectors/policy.py ROLES: Analyst | Senior Analyst | Platform Admin.
ALTER TABLE ai_platform_db.user_access
    ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'Analyst';
