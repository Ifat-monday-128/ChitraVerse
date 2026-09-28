// SQL for createAccount.js. Values are bound by the caller.

exports.insertUsers = "INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4)";
