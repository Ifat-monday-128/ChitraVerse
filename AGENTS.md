# Project instructions

## Steps to follow

# Authentication Requirements — 60% Evaluation

## Login

- Implement a real login system for every role defined in the project.
- Login must verify the user's email/username and password against the database.
- Passwords must be stored only as secure hashes using bcrypt, argon2, scrypt, or equivalent.
- Never store plain-text passwords.
- The user's role must be read from the database during login.
- Do not trust a role sent by the frontend.
- After successful login, create a real authenticated session using either:
  - JWT with proper secure handling, or
  - server-side session with an HTTP-only cookie.
- Protected routes must verify the authenticated session/token on the backend.
- Invalid credentials must return `401 Unauthorized`.
- Missing or malformed login fields must return `400 Bad Request`.
- Login responses must never expose the password or password hash.
- During evaluation, it must be possible to log in as every role one after another from a clean state.

## Logout

- Implement a real logout mechanism.
- Logout must genuinely invalidate the current session/token.
- Do not implement logout as only a frontend redirect or only deleting frontend state.
- After logout, previously authenticated protected requests must fail.
- If server-side sessions are used, destroy the session on logout.
- If JWT is used, implement an actual invalidation strategy such as:
  - refresh-token revocation,
  - token/session versioning,
  - denylist/revocation storage,
  - or another secure server-controlled invalidation method.
- After logout, accessing a protected endpoint must return `401 Unauthorized`.
- The frontend should clear its local authentication state only after the backend logout succeeds.

## Rules and constraints

1. dont change our database structure too much unless its one time and really necessary.

## Checks before finishing

always make sure that the server and frontend runs properly befotre finishing your work.
