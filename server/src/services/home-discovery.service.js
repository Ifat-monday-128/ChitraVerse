const queries = require('./home-discovery.queries');
const pool = require('../config/db');

exports.releases = async (date) => {
  const { rows } = await pool.query(queries.releasedToday, [date]);
  return { date, items: rows };
};

exports.interests = async () => {
  const { rows } = await pool.query(queries.genreInterests);
  return { items: rows };
};

exports.boxOffice = async () => {
  const { rows } = await pool.query(queries.topBoxOffice);
  return { items: rows, territory: 'worldwide', period: 'lifetime', currency: 'USD' };
};

exports.birthdays = async (date) => {
  const { rows } = await pool.query(queries.birthdays, [date]);
  return { date, items: rows };
};
