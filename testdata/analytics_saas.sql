-- Test analytics database #2: SaaS (subscriptions, usage, marketing)
-- SQLite-compatible DDL + sample data

PRAGMA foreign_keys = ON;

CREATE TABLE dim_plan (
  plan_id       INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  mrr_rub       REAL NOT NULL,
  max_seats     INTEGER
);

CREATE TABLE dim_campaign (
  campaign_id   INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  channel       TEXT NOT NULL,
  start_date    TEXT NOT NULL,
  budget_rub    REAL NOT NULL
);

CREATE TABLE dim_user (
  user_id       INTEGER PRIMARY KEY,
  email         TEXT NOT NULL,
  country       TEXT NOT NULL,
  signup_at     TEXT NOT NULL,
  acquisition   TEXT NOT NULL CHECK (acquisition IN ('organic', 'paid', 'referral'))
);

CREATE TABLE fact_subscription (
  sub_id        INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES dim_user(user_id),
  plan_id       INTEGER NOT NULL REFERENCES dim_plan(plan_id),
  started_at    TEXT NOT NULL,
  ended_at      TEXT,
  status        TEXT NOT NULL CHECK (status IN ('trial', 'active', 'churned', 'paused'))
);

CREATE TABLE fact_usage_daily (
  usage_id      INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES dim_user(user_id),
  usage_date    TEXT NOT NULL,
  api_calls     INTEGER NOT NULL DEFAULT 0,
  storage_gb    REAL NOT NULL DEFAULT 0,
  active_minutes INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE fact_marketing_spend (
  spend_id      INTEGER PRIMARY KEY,
  campaign_id   INTEGER NOT NULL REFERENCES dim_campaign(campaign_id),
  spend_date    TEXT NOT NULL,
  amount_rub    REAL NOT NULL,
  clicks        INTEGER NOT NULL DEFAULT 0,
  signups       INTEGER NOT NULL DEFAULT 0
);

-- Plans
INSERT INTO dim_plan (plan_id, code, name, mrr_rub, max_seats) VALUES
  (1, 'starter', 'Starter', 990, 3),
  (2, 'team', 'Team', 4990, 25),
  (3, 'enterprise', 'Enterprise', 29900, NULL);

-- Campaigns
INSERT INTO dim_campaign (campaign_id, name, channel, start_date, budget_rub) VALUES
  (1, 'Spring 2025 — search', 'google', '2025-03-01', 150000),
  (2, 'Podcast integrators', 'podcast', '2025-02-15', 80000),
  (3, 'Web retargeting', 'display', '2025-03-05', 45000);

-- Users
INSERT INTO dim_user (user_id, email, country, signup_at, acquisition) VALUES
  (1, 'ceo@startup.io', 'US', '2025-02-10T09:00:00', 'paid'),
  (2, 'dev@buildco.com', 'US', '2025-02-28T14:30:00', 'organic'),
  (3, 'pm@product.ee', 'EE', '2025-03-01T11:15:00', 'referral'),
  (4, 'ops@logistics.com', 'US', '2025-03-04T08:45:00', 'paid'),
  (5, 'founder@saas.io', 'US', '2025-03-08T16:20:00', 'organic');

-- Subscriptions
INSERT INTO fact_subscription (sub_id, user_id, plan_id, started_at, ended_at, status) VALUES
  (1, 1, 3, '2025-02-10T09:05:00', NULL, 'active'),
  (2, 2, 2, '2025-02-28T14:35:00', NULL, 'active'),
  (3, 3, 1, '2025-03-01T11:20:00', NULL, 'trial'),
  (4, 4, 2, '2025-03-04T08:50:00', NULL, 'active'),
  (5, 5, 1, '2025-03-08T16:25:00', '2025-03-18T12:00:00', 'churned');

-- Daily usage (sample days)
INSERT INTO fact_usage_daily (usage_id, user_id, usage_date, api_calls, storage_gb, active_minutes) VALUES
  (1, 1, '2025-03-20', 12400, 48.5, 220),
  (2, 2, '2025-03-20', 3100, 12.1, 95),
  (3, 3, '2025-03-20', 420, 0.8, 35),
  (4, 4, '2025-03-20', 8900, 22.0, 180),
  (5, 1, '2025-03-21', 11800, 49.0, 205),
  (6, 2, '2025-03-21', 2950, 12.3, 88),
  (7, 5, '2025-03-15', 150, 0.2, 12);

-- Marketing spend
INSERT INTO fact_marketing_spend (spend_id, campaign_id, spend_date, amount_rub, clicks, signups) VALUES
  (1, 1, '2025-03-20', 5200, 1840, 14),
  (2, 1, '2025-03-21', 5100, 1720, 11),
  (3, 2, '2025-03-20', 1200, 0, 3),
  (4, 3, '2025-03-20', 2100, 9200, 6),
  (5, 3, '2025-03-21', 2050, 9050, 5);
