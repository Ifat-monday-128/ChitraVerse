const where=`FROM awards a JOIN media m USING(title_id) LEFT JOIN movie mo USING(title_id) LEFT JOIN series s USING(title_id)
    WHERE (mo.title_id IS NOT NULL OR s.title_id IS NOT NULL)
    AND ($1='' OR strpos(lower(m.title||' '||COALESCE(a.name,'')||' '||COALESCE(a.category,'')),lower($1))>0)
    AND ($2='all' OR ($2='movie' AND mo.title_id IS NOT NULL) OR ($2='series' AND mo.title_id IS NULL AND s.title_id IS NOT NULL))
    AND ($3='' OR a.name=$3) AND ($4::int IS NULL OR a.year=$4)`;
const columns=`a.award_id,a.result,a.recipient,a.name,a.year,a.category,a.description,a.source_name,a.source_url,a.retrieved_at`;

// SQL for routes/awards.routes.js. Values are bound by the caller.

exports.countTitles = `SELECT COUNT(DISTINCT m.title_id)::int AS total ${where}`;

exports.listTitles = `SELECT m.title_id,m.title,m.poster,CASE WHEN mo.title_id IS NOT NULL THEN 'movie' ELSE 'series' END AS media_type,
      COUNT(*)::int AS award_count, json_agg(json_build_object('award_id',a.award_id,'name',a.name,'year',a.year,'category',a.category,
      'result',a.result,'recipient',a.recipient,'description',a.description,'source_name',a.source_name,'source_url',a.source_url) ORDER BY a.year DESC NULLS LAST,a.name,a.award_id) AS awards
      ${where} GROUP BY m.title_id,mo.title_id ORDER BY COUNT(*) DESC,m.title,m.title_id LIMIT $5 OFFSET $6`;

exports.collectionSummary = `SELECT COUNT(*)::int AS records,COUNT(DISTINCT a.title_id) FILTER(WHERE mo.title_id IS NOT NULL)::int AS movies,
      COUNT(DISTINCT a.title_id) FILTER(WHERE mo.title_id IS NULL AND s.title_id IS NOT NULL)::int AS series,MAX(a.retrieved_at) AS retrieved_at
      FROM awards a LEFT JOIN movie mo USING(title_id) LEFT JOIN series s USING(title_id)`;

exports.awardNames = 'SELECT DISTINCT name FROM awards WHERE name IS NOT NULL ORDER BY name';

exports.awardYears = 'SELECT DISTINCT year FROM awards WHERE year IS NOT NULL ORDER BY year DESC';

exports.titleExists = 'SELECT 1 FROM media WHERE title_id=$1';

exports.titleAwards = `SELECT ${columns} FROM awards a WHERE title_id=$1 ORDER BY year DESC NULLS LAST,name,award_id`;
