const queries = require('./directory.queries');
const pool = require('../config/db');

exports.people = async (options) => {
  const statements = queries.people(options);
  const [{ rows: [count] }, { rows: items }] = await Promise.all([
    pool.query(statements.count), pool.query(statements.items),
  ]);
  return { items, total: count.total, hasMore: options.offset + items.length < count.total };
};

exports.company = async (companyId, filters) => {
  const { rows: [company] } = await pool.query(queries.findCompany, [companyId]);
  if (!company) return null;
  const results = await require('./media.service').browse({ ...filters, companyId, sort: filters.sort || 'newest' });
  return { company, ...results };
};
