const { createHmac, randomBytes, timingSafeEqual } = require("node:crypto");

const issuer = "chitraverse-api";
const audience = "chitraverse-web";
const lifetimeSeconds = 7 * 24 * 60 * 60;

function loadSigningSecret() {
  const configured = process.env.JWT_SECRET;
  if (configured && Buffer.byteLength(configured) >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be configured with at least 32 bytes in production.");
  }
  // Local-only fallback. Restarting the API intentionally invalidates these JWTs.
  return randomBytes(64).toString("base64url");
}

const jwtSecret = loadSigningSecret();

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(input) {
  return createHmac("sha256", jwtSecret).update(input).digest("base64url");
}

function createJwt(userId) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    iss: issuer,
    aud: audience,
    sub: String(userId),
    jti: randomBytes(32).toString("hex"),
    iat: now,
    exp: now + lifetimeSeconds,
  });
  const unsigned = `${header}.${payload}`;
  return { token: `${unsigned}.${sign(unsigned)}`, expiresAt: new Date((now + lifetimeSeconds) * 1000) };
}

function verifyJwt(token) {
  if (typeof token !== "string" || token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [encodedHeader, encodedPayload, suppliedSignature] = token.split(".");
  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "HS256" || header.typ !== "JWT" || payload.iss !== issuer || payload.aud !== audience
      || typeof payload.sub !== "string" || !/^[1-9]\d*$/.test(payload.sub)
      || typeof payload.jti !== "string" || !/^[a-f0-9]{64}$/.test(payload.jti)
      || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)
      || payload.iat > now + 30 || payload.exp <= now || payload.exp - payload.iat !== lifetimeSeconds) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { createJwt, verifyJwt, lifetimeSeconds };
