// Local administrator command. Public registration always assigns the user role.
const { randomBytes, scrypt } = require("node:crypto");
const { promisify } = require("node:util");
const pool = require("./config/db");

async function createAccount() {
  const [emailInput, role = "user", name = role] = process.argv.slice(2);
  const email = emailInput?.trim().toLowerCase();
  if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !/^[a-z][a-z0-9_-]{0,49}$/.test(role) || !name.trim() || name.length > 255) {
    throw new Error('Usage: npm run account:create -- email role "Display Name"');
  }
  const password = randomBytes(18).toString("base64url");
  const salt = randomBytes(16).toString("hex");
  const key = await promisify(scrypt)(password, salt, 64);
  await pool.query(
    "INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4)",
    [name.trim(), email, `scrypt:${salt}:${key.toString("hex")}`, role],
  );
  console.log(`Account created. Email: ${email}\nRole: ${role}\nPassword: ${password}\nSave this password; it is shown only now.`);
}

createAccount().catch((error) => {
  console.error(error.code === "23505" ? "That email already exists. The existing account was preserved." : error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
