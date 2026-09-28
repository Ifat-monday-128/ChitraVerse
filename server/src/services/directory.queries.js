// SQL for services/directory.service.js. Values are bound by the caller.

exports.countPeople = (source) => `SELECT COUNT(*)::int AS total ${source}`;

exports.listPeople = (source, order, limitIndex, offsetIndex) => `SELECT cast_crew_id, name, photo ${source} ORDER BY ${order}, cast_crew_id LIMIT $${limitIndex} OFFSET $${offsetIndex}`;

exports.findCompany = 'SELECT company_id, name, country, logo FROM production_house WHERE company_id=$1';

exports.people = ({ q, limit, offset, role, photo, born_from, born_to, sort }) => {
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
  return {
    count: { text: exports.countPeople(source), values },
    items: { text: exports.listPeople(source, order, values.length + 1, values.length + 2), values: [...values, limit, offset] },
  };
};
