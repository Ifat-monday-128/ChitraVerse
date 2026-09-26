const { createHash, scryptSync } = require('node:crypto');
const { createJwt } = require('../../src/utils/jwt');
// Catalog regression fixtures now authenticate through the same signed sessions
// checked by the API. Anonymous/revoked access is tested separately in auth.test.
module.exports = async function mediaCookie(pool) {
  let { rows: [user] } = await pool.query("SELECT user_id FROM users WHERE role='user' ORDER BY user_id LIMIT 1");
  if (!user) ({ rows: [user] } = await pool.write("INSERT INTO users(name,email,password_hash,role) VALUES('Catalog reader','catalog-reader@example.invalid',$1,'user') RETURNING user_id", [`scrypt:fixture:${scryptSync('Fixture password 123','fixture',64).toString('hex')}`]));
  const { token, expiresAt } = createJwt(user.user_id);
  await pool.write('INSERT INTO user_session(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(token).digest('hex'),user.user_id,expiresAt]);
  return `chitraverse_session=${token}`;
};
