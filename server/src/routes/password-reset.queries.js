// SQL for routes/password-reset.routes.js. Values are bound by the caller.

exports.selectUserIdUsers = 'SELECT user_id FROM users WHERE email=$1 FOR UPDATE';

exports.selectPasswordReset = "SELECT 1 FROM password_reset WHERE user_id=$1 AND sent_at>now()-interval '60 seconds'";

exports.insertPasswordReset = `INSERT INTO password_reset(user_id,code_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes')
        ON CONFLICT(user_id) DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,attempts=0,sent_at=now()`;

exports.selectPasswordReset2 = 'SELECT *,expires_at>now() AS valid FROM password_reset WHERE user_id=$1 FOR UPDATE';

exports.updatePasswordReset = 'UPDATE password_reset SET attempts=attempts+1 WHERE user_id=$1';

exports.updateUsers = 'UPDATE users SET password_hash=$1 WHERE user_id=$2';

exports.deleteUserSession = 'DELETE FROM user_session WHERE user_id=$1';

exports.deletePasswordReset = 'DELETE FROM password_reset WHERE user_id=$1';
