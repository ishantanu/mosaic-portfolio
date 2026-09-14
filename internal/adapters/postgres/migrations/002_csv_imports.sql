CREATE TABLE imported_portfolios (
    owner_id TEXT NOT NULL,
    id TEXT NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    snapshot_at TIMESTAMPTZ NOT NULL,
    holdings JSONB NOT NULL,
    PRIMARY KEY (owner_id, id)
);
