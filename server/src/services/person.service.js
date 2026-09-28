const queries = require('./person.queries');
const pool = require('../config/db');

function ageAt(birthday, end = new Date().toISOString().slice(0, 10)) {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday) || end < birthday) return null;
  return Number(end.slice(0, 4)) - Number(birthday.slice(0, 4)) - (end.slice(5) < birthday.slice(5) ? 1 : 0);
}

exports.getPerson = async (personId) => {
  const { rows: [person] } = await pool.query(queries.selectCastCrewIdCastCrew, [personId]);
  if (!person) return null;
  const { rows: filmography } = await pool.query(queries.selectTitleIdMedia, [personId]);
  // Calculate completed years from the stored birthday; no age is persisted.
  return { ...person, deathday: null, age: ageAt(person.date_of_birth), place_of_birth: null,
    profile_source: 'library', filmography };
};
exports.ageAt = ageAt;
