CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS incidents (
  id          TEXT PRIMARY KEY,
  time        TIMESTAMPTZ NOT NULL,
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('calm','watch','elevated','high','critical')),
  source      TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('official','news','social','scrape','context')),
  url         TEXT,
  location    TEXT NOT NULL,
  geom        GEOGRAPHY(POINT, 4326) NOT NULL,
  confidence  REAL NOT NULL DEFAULT 0.5,
  cluster_id  TEXT,
  raw_hash    TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_incidents_time    ON incidents (time DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_geom    ON incidents USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_incidents_cluster ON incidents (cluster_id);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents (severity);
