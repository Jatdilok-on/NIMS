CREATE TABLE IF NOT EXISTS relay_targets (
  token_hash TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relay_reports (
  token_hash TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  reported_at TEXT NOT NULL
);
