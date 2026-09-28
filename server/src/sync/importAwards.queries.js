// SQL for sync/importAwards.js. Values are bound by the caller.

exports.lockImport = 'SELECT pg_advisory_xact_lock(216,2)';

exports.findCatalogTitle = (table) => `SELECT m.title_id,m.title FROM media m JOIN ${table} t USING(title_id)
        WHERE abs(m.tmdb_id::bigint)=$1`;

exports.upsertAward = `INSERT INTO awards(title_id,name,year,category,description,source_name,source_url,source_key,retrieved_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(title_id,source_key) DO UPDATE SET
          name=EXCLUDED.name,year=EXCLUDED.year,category=EXCLUDED.category,description=EXCLUDED.description,
          source_name=EXCLUDED.source_name,source_url=EXCLUDED.source_url,retrieved_at=EXCLUDED.retrieved_at`;
