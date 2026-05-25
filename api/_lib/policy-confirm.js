"use strict";

const crypto = require("crypto");

const DEFAULT_TTL_SECONDS = 300;

function policySecret() {
  const explicit =
    process.env.POLICY_HMAC_SECRET ||
    process.env.POLICY_CONFIRM_SECRET ||
    "";
  if (explicit.trim()) return explicit.trim();
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey && openRouterKey.trim()) {
    return crypto.createHash("sha256").update(openRouterKey.trim()).digest("hex");
  }
  return "hayk-policy-dev-secret";
}

function issueConfirmationToken(action, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const expires = Math.floor(Date.now() / 1000) + Math.max(Number(ttlSeconds) || 0, 1);
  const payload = `${expires}:${action}`;
  const sig = crypto
    .createHmac("sha256", policySecret())
    .update(payload)
    .digest("hex");
  return `${expires}.${sig}`;
}

function verifyConfirmationToken(token, action) {
  if (!token || !String(token).trim()) {
    return { ok: false, reason: "missing confirmation token" };
  }
  const parts = String(token).trim().split(".", 2);
  if (parts.length !== 2) {
    return { ok: false, reason: "malformed confirmation token" };
  }
  const [expiresRaw, sig] = parts;
  const expires = Number.parseInt(expiresRaw, 10);
  if (!Number.isFinite(expires)) {
    return { ok: false, reason: "malformed confirmation token expiry" };
  }
  if (Math.floor(Date.now() / 1000) > expires) {
    return { ok: false, reason: "confirmation token expired" };
  }
  const payload = `${expires}:${action}`;
  const expected = crypto
    .createHmac("sha256", policySecret())
    .update(payload)
    .digest("hex");
  const sigBuf = Buffer.from(sig, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, reason: "invalid confirmation token signature" };
  }
  return { ok: true, reason: "ok" };
}

module.exports = {
  DEFAULT_TTL_SECONDS,
  issueConfirmationToken,
  policySecret,
  verifyConfirmationToken,
};
