CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    broker TEXT NOT NULL,
    base_currency CHAR(3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL,
    total_value NUMERIC(20,4) NOT NULL,
    cash NUMERIC(20,4) NOT NULL,
    currency CHAR(3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT portfolio_snapshots_account_recorded_at_unique UNIQUE (account_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS portfolio_snapshots_account_recorded_at_idx
    ON portfolio_snapshots (account_id, recorded_at DESC);
