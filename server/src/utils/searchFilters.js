const sorts = ['relevance', 'rating_desc', 'rating_asc', 'newest', 'oldest', 'title_asc', 'title_desc', 'runtime_asc', 'runtime_desc'];
exports.parseFilters = query => {
  const result = {};
  for (const [key, min, max] of [['genre',1,2147483647],['year_from',1870,2200],['year_to',1870,2200],['rating_min',0,10],['rating_max',0,10],['runtime_min',0,2000],['runtime_max',0,2000]]) {
    const value = query[key];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max || (!key.startsWith('rating') && !Number.isInteger(Number(value)))) throw new Error('Invalid filter: ' + key);
    result[key] = Number(value);
  }
  for (const [low, high] of [['year_from','year_to'],['rating_min','rating_max'],['runtime_min','runtime_max']]) if (result[low] !== undefined && result[high] !== undefined && result[low] > result[high]) throw new Error('Minimum must not exceed maximum.');
  for (const key of ['language','country','trailer','sort']) {
    if (query[key] === undefined || query[key] === '') continue;
    if (typeof query[key] !== 'string') throw new Error('Invalid filter: ' + key);
    result[key] = query[key];
  }
  if (result.language && !/^[a-z]{2,3}$/.test(result.language)) throw new Error('Invalid language');
  if (result.country && !/^[A-Z]{2}$/.test(result.country)) throw new Error('Invalid production country');
  if (result.trailer && !['yes','no'].includes(result.trailer)) throw new Error('Invalid trailer filter');
  if (result.sort && !sorts.includes(result.sort)) throw new Error('Invalid sort order');
  return result;
};

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
