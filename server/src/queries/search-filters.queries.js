exports.conditions = (filters, bind) => {
  const conditions = [];
  const date = 'COALESCE(mo.release_date,s.first_air_date)';
  if (filters.genre) conditions.push(`EXISTS(SELECT 1 FROM media_genre mg WHERE mg.title_id=m.title_id AND mg.genre_id=${bind(filters.genre)})`);
  if (filters.language) conditions.push(`m.language=${bind(filters.language)}`);
  if (filters.country) conditions.push(`EXISTS(SELECT 1 FROM media_company mc JOIN production_house ph USING(company_id) WHERE mc.title_id=m.title_id AND ph.country=${bind(filters.country)})`);
  if (filters.year_from !== undefined) conditions.push(`${date} >= ${bind(`${filters.year_from}-01-01`)}::date`);
  if (filters.year_to !== undefined) conditions.push(`${date} <= ${bind(`${filters.year_to}-12-31`)}::date`);
  for (const [key, column, operator] of [['rating_min','m.tmdb_rating','>='],['rating_max','m.tmdb_rating','<='],['runtime_min','mo.runtime','>='],['runtime_max','mo.runtime','<=']]) if (filters[key] !== undefined) conditions.push(`${column} ${operator} ${bind(filters[key])}`);
  if (filters.trailer) conditions.push(`NULLIF(TRIM(m.trailer_link),'') IS ${filters.trailer === 'yes' ? 'NOT ' : ''}NULL`);
  return conditions;
};
exports.order = sort => ({ rating_desc:'m.tmdb_rating DESC NULLS LAST', rating_asc:'m.tmdb_rating ASC NULLS LAST', newest:'COALESCE(mo.release_date,s.first_air_date) DESC NULLS LAST', oldest:'COALESCE(mo.release_date,s.first_air_date) ASC NULLS LAST', title_asc:'lower(m.title) ASC', title_desc:'lower(m.title) DESC', runtime_asc:'mo.runtime ASC NULLS LAST', runtime_desc:'mo.runtime DESC NULLS LAST' }[sort] || 'relevance DESC, m.tmdb_rating DESC NULLS LAST');
