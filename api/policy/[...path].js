const { cors, json, readBody } = require("../_openrouter");
const { classifyAction, toDict } = require("../_lib/policy-gate");
const { verifyConfirmationToken } = require("../_lib/policy-confirm");
const { emitPolicyEvent, runIdFromRequest } = require("../_lib/policy-enforce");

function routeName(req) {
  const pathname = new URL(req.url || "/", "https://local.invalid").pathname;
  return pathname.replace(/^\/api\/policy\/?/, "").replace(/\/$/, "");
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }

  const route = routeName(req);
  const runId = runIdFromRequest(req);

  if (route === "check" && req.method === "POST") {
    const body = readBody(req);
    const action = typeof body.action === "string" ? body.action.trim() : "";
    const context = body.context && typeof body.context === "object" ? body.context : {};
    if (!action) {
      return json(res, 422, { detail: "action must not be empty" });
    }
    const decision = classifyAction(action, context);
    emitPolicyEvent({
      runId,
      decision,
      action,
      outcome: "check",
      extra: { context },
    });
    return json(res, 200, toDict(decision));
  }

  if (route === "confirm" && req.method === "POST") {
    const body = readBody(req);
    const action = typeof body.action === "string" ? body.action.trim() : "";
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!action || !token) {
      return json(res, 422, { detail: "action and token are required" });
    }
    const { ok, reason } = verifyConfirmationToken(token, action);
    emitPolicyEvent({
      runId,
      decision: {
        allowed: ok,
        risk: "read",
        requiresConfirmation: false,
        reason,
        confirmationToken: null,
      },
      action,
      outcome: ok ? "confirmed" : "confirm_rejected",
    });
    if (!ok) {
      return json(res, 400, { detail: reason });
    }
    return json(res, 200, { ok: "true", action });
  }

  return json(res, 404, { detail: "Policy route not found" });
};
