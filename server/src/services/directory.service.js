const pool = require('../config/db');

exports.people = async ({ q, limit, offset, role, photo, born_from, born_to, sort }) => {
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const values = [pattern];
  const bind = value => { values.push(value); return `$${values.length}`; };
  const conditions = ["COALESCE(name, '') ILIKE $1"];
  if (role) conditions.push(`EXISTS(SELECT 1 FROM media_cast_crew mc WHERE mc.cast_crew_id=cast_crew.cast_crew_id AND mc.role_id=${bind(Number(role))})`);
  if (photo) conditions.push(`NULLIF(TRIM(photo),'') IS ${photo === 'yes' ? 'NOT ' : ''}NULL`);
  if (born_from) conditions.push(`date_of_birth >= ${bind(`${born_from}-01-01`)}::date`);
  if (born_to) conditions.push(`date_of_birth <= ${bind(`${born_to}-12-31`)}::date`);
  const source = `FROM cast_crew WHERE ${conditions.join(' AND ')}`;
  const order = { name_desc:'name DESC NULLS LAST', birth_asc:'date_of_birth ASC NULLS LAST', birth_desc:'date_of_birth DESC NULLS LAST' }[sort] || 'name ASC NULLS LAST';
  const [{ rows: [count] }, { rows: items }] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total ${source}`, values),
    pool.query(`SELECT cast_crew_id, name, photo ${source} ORDER BY ${order}, cast_crew_id LIMIT $${values.length+1} OFFSET $${values.length+2}`, [...values,limit,offset]),
  ]);
  return { items, total: count.total, hasMore: offset + items.length < count.total };
};

exports.company = async (companyId, filters) => {
  const { rows: [company] } = await pool.query('SELECT company_id, name, country, logo FROM production_house WHERE company_id=$1', [companyId]);
  if (!company) return null;
  const results = await require('./media.service').browse({ ...filters, companyId, sort: filters.sort || 'newest' });
  return { company, ...results };
};
