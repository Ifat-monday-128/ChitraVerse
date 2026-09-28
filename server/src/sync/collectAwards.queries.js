// SQL for sync/collectAwards.js. Values are bound by the caller.

exports.catalogTitles = `SELECT m.title_id,m.tmdb_id,m.title,
    to_char(COALESCE(mo.release_date,s.first_air_date),'YYYY-MM-DD') AS release_date,
    CASE WHEN mo.title_id IS NOT NULL THEN 'movie' ELSE 'series' END AS media_type
    FROM media m LEFT JOIN movie mo USING(title_id) LEFT JOIN series s USING(title_id)
    WHERE mo.title_id IS NOT NULL OR s.title_id IS NOT NULL`;

exports.wikidataAwards = (property) => `SELECT ?item ?tmdb ?award ?date ?statement WHERE { ?item wdt:${property} ?tmdb; p:P166 ?statement. ?statement ps:P166 ?award. FILTER NOT EXISTS { ?statement wikibase:rank wikibase:DeprecatedRank } OPTIONAL { ?statement pq:P585 ?date } }`;
