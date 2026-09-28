const sorts = ['relevance', 'random', 'rating_desc', 'rating_asc', 'newest', 'oldest', 'title_asc', 'title_desc', 'runtime_asc', 'runtime_desc'];
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
  if (query.seed !== undefined) {
    if (typeof query.seed !== 'string' || !/^[a-f0-9]{32}$/.test(query.seed)) throw new Error('Invalid shuffle seed');
    result.seed = query.seed;
  }
  return result;
};
