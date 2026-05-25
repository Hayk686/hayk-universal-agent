"use strict";

const { classifyAction, toDict } = require("./policy-gate");
const { verifyConfirmationToken } = require("./policy-confirm");

function newRunId() {
  return `vercel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function runIdFromRequest(req) {
  const header = req.headers?.["x-run-id"] || req.headers?.["X-Run-Id"];
  if (typeof header === "string" && header.trim()) return header.trim();
  return newRunId();
}

function emitPolicyEvent({ runId, decision, action, outcome, extra = {} }) {
  const event = {
    ts: new Date().toISOString(),
    runId,
    layer: "policy",
    decision: decision.allowed
      ? "allow"
      : decision.requiresConfirmation
        ? "confirm"
        : "deny",
    reason: decision.reason,
    inputsRedacted: { action, ...extra },
    outcome,
  };
  console.log(JSON.stringify(event));
}

function policyHttpDetail(decision, action) {
  return {
    detail: decision.reason,
    policy: toDict(decision),
    action,
  };
}

function policyForbidden(res, json, decision, action, confirmError) {
  const body = {
    detail: {
      ...policyHttpDetail(decision, action),
      ...(confirmError ? { confirmError } : {}),
    },
  };
  return json(res, 403, body);
}

function enforcePolicy({
  req,
  res,
  json,
  action,
  context,
  confirmationToken,
}) {
  const runId = runIdFromRequest(req);
  const decision = classifyAction(action, context);
  emitPolicyEvent({ runId, decision, action, outcome: "classified" });

  if (decision.allowed) {
    emitPolicyEvent({ runId, decision, action, outcome: "allowed" });
    return { allowed: true, runId, decision };
  }

  if (decision.requiresConfirmation) {
    if (confirmationToken) {
      const { ok, reason } = verifyConfirmationToken(confirmationToken, action);
      if (ok) {
        const confirmed = allowDecision(decision);
        emitPolicyEvent({ runId, decision: confirmed, action, outcome: "confirmed" });
        return { allowed: true, runId, decision: confirmed };
      }
      emitPolicyEvent({
        runId,
        decision,
        action,
        outcome: `confirm_failed:${reason}`,
      });
      policyForbidden(res, json, decision, action, reason);
      return { allowed: false, runId, decision, blocked: true };
    }
    emitPolicyEvent({ runId, decision, action, outcome: "confirm_required" });
    policyForbidden(res, json, decision, action);
    return { allowed: false, runId, decision, blocked: true };
  }

  emitPolicyEvent({ runId, decision, action, outcome: "denied" });
  policyForbidden(res, json, decision, action);
  return { allowed: false, runId, decision, blocked: true };
}

function allowDecision(decision) {
  return {
    allowed: true,
    risk: decision.risk,
    requiresConfirmation: false,
    reason: "confirmation token accepted",
    confirmationToken: null,
  };
}

function enforceChatMessagePolicy({ req, res, json, message, endpoint }) {
  const action = "exec chat message";
  const decision = classifyAction(action, {
    endpoint,
    kind: "exec",
    command: message,
    chat_message: true,
  });
  const runId = runIdFromRequest(req);
  emitPolicyEvent({ runId, decision, action, outcome: "chat_check", extra: { endpoint } });
  if (!decision.allowed) {
    policyForbidden(res, json, decision, action);
    return { allowed: false, runId, decision, blocked: true };
  }
  return { allowed: true, runId, decision };
}

module.exports = {
  emitPolicyEvent,
  enforceChatMessagePolicy,
  enforcePolicy,
  newRunId,
  policyHttpDetail,
  runIdFromRequest,
};
