"use strict";

/**
 * Minimal PolicyGate matrix for Vercel serverless — mirrors
 * dashboard/backend/app/policy/gate.py (drift risk: keep in sync manually).
 */

const { issueConfirmationToken } = require("./policy-confirm");

const CMDPOS =
  "(?:^|[;&|\\n`]|\\$\\()" +
  "\\s*" +
  "(?:sudo\\s+(?:-[^\\s]+\\s+)*)?" +
  "(?:env\\s+(?:\\w+=\\S*\\s+)*)?" +
  "(?:(?:exec|nohup|setsid|time)\\s+)*" +
  "\\s*";

const HARDLINE_PATTERNS = [
  [/\brm\s+(-[^\s]*\s+)*(\/|\/\*|\/ \*)(\s|$)/i, "recursive delete of root filesystem"],
  [
    /\brm\s+(-[^\s]*\s+)*(\/home|\/home\/\*|\/root|\/root\/\*|\/etc|\/etc\/\*|\/usr|\/usr\/\*|\/var|\/var\/\*|\/bin|\/bin\/\*|\/sbin|\/sbin\/\*|\/boot|\/boot\/\*|\/lib|\/lib\/\*)(\s|$)/i,
    "recursive delete of system directory",
  ],
  [/\brm\s+(-[^\s]*\s+)*(~|\$HOME)(\/?|\/*)?(\s|$)/i, "recursive delete of home directory"],
  [/\bmkfs(\.[a-z0-9]+)?\b/i, "format filesystem (mkfs)"],
  [/\bdd\b[^\n]*\bof=\/dev\/(sd|nvme|hd|mmcblk|vd|xvd)[a-z0-9]*/i, "dd to raw block device"],
  [/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/i, "fork bomb"],
  [new RegExp(`${CMDPOS}(shutdown|reboot|halt|poweroff)\\b`, "i"), "system shutdown/reboot"],
];

const INJECTION_PATTERNS = [
  /[;&|]\s*(?:rm|curl|wget|bash|sh|python|perl|ruby|node)\b/i,
  /`[^`]+`/,
  /\$\([^)]+\)/,
  /\|\|\s*/,
  /&&\s*rm\b/i,
  /\n\s*rm\b/i,
];

const PAYMENT_KEYWORDS = new Set([
  "payment",
  "checkout",
  "stripe",
  "paypal",
  "wire transfer",
  "credit card",
  "debit card",
  "buy now",
  "purchase order",
  "send money",
  "bank account",
]);

const SENSITIVE_WRITE_NAMES = new Set(["agents.md"]);

/** Commands allowed on Vercel cloud (subset of FastAPI whitelist). */
const EXEC_WHITELIST = new Set([
  "hermes status",
  "hermes doctor",
  'hermes -z "Say exactly: OK"',
]);

const ActionRisk = {
  READ: "read",
  WRITE: "write",
  EXEC: "exec",
  NETWORK: "network",
  BROWSER: "browser",
  PAYMENT: "payment",
};

function normalize(text) {
  return String(text || "").replace(/\0/g, "").normalize("NFKC");
}

function allow(risk, reason) {
  return {
    allowed: true,
    risk,
    requiresConfirmation: false,
    reason,
    confirmationToken: null,
  };
}

function deny(risk, reason) {
  return {
    allowed: false,
    risk,
    requiresConfirmation: false,
    reason,
    confirmationToken: null,
  };
}

function confirm(risk, reason, action) {
  return {
    allowed: false,
    risk,
    requiresConfirmation: true,
    reason,
    confirmationToken: issueConfirmationToken(action),
  };
}

function toDict(decision) {
  return { ...decision };
}

function inferRisk(action, context) {
  const explicit = context.risk || context.kind;
  if (explicit && Object.values(ActionRisk).includes(String(explicit).trim().toLowerCase())) {
    return String(explicit).trim().toLowerCase();
  }
  const endpoint = String(context.endpoint || "");
  if (endpoint.includes("/browser/") || endpoint.endsWith("/browser/analyze")) {
    return ActionRisk.BROWSER;
  }
  if (context.browser_action && String(context.browser_action).trim()) {
    return ActionRisk.BROWSER;
  }
  if (endpoint.endsWith("/chat/web-send") || endpoint.includes("/chat/web-send")) {
    return ActionRisk.NETWORK;
  }
  if (endpoint.endsWith("/research/query") || endpoint.includes("/research/query")) {
    return ActionRisk.NETWORK;
  }
  if (endpoint.endsWith("/commands/run") || endpoint.includes("/commands/run")) {
    return ActionRisk.EXEC;
  }
  if (endpoint.endsWith("/agents-md") && String(context.method || "").toUpperCase() === "PUT") {
    return ActionRisk.WRITE;
  }
  const lowered = action.trim().toLowerCase();
  for (const [prefix, risk] of [
    ["read ", ActionRisk.READ],
    ["write ", ActionRisk.WRITE],
    ["exec ", ActionRisk.EXEC],
    ["network ", ActionRisk.NETWORK],
    ["browser ", ActionRisk.BROWSER],
    ["payment ", ActionRisk.PAYMENT],
  ]) {
    if (lowered.startsWith(prefix)) return risk;
  }
  if (lowered.includes("web-send") || lowered.startsWith("network")) return ActionRisk.NETWORK;
  if (lowered.includes("browser") && lowered.includes("analyze")) return ActionRisk.BROWSER;
  if (lowered.startsWith("payment") || [...PAYMENT_KEYWORDS].some((k) => lowered.includes(k))) {
    return ActionRisk.PAYMENT;
  }
  return null;
}

function extractCommand(action, context) {
  if (context.command) return String(context.command).trim();
  const lowered = action.trim();
  if (lowered.toLowerCase().startsWith("exec ")) return lowered.slice(5).trim();
  return lowered;
}

function matchesHardline(command) {
  const normalized = normalize(command).toLowerCase();
  for (const [pattern, description] of HARDLINE_PATTERNS) {
    if (pattern.test(normalized)) return { hit: true, description };
  }
  return { hit: false, description: "" };
}

function hasCommandInjection(text) {
  const normalized = normalize(text);
  return INJECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isPaymentAction(action, risk) {
  if (risk === ActionRisk.PAYMENT) return true;
  const lowered = action.toLowerCase();
  return [...PAYMENT_KEYWORDS].some((k) => lowered.includes(k));
}

function isWhitelistedCommand(cmd) {
  return EXEC_WHITELIST.has(String(cmd || "").trim());
}

function classifyAction(action, context = {}) {
  const ctx = { ...context };
  const trimmed = String(action || "").trim();
  if (!trimmed) return deny(ActionRisk.EXEC, "empty action");

  const risk = inferRisk(trimmed, ctx) || ActionRisk.EXEC;

  if (isPaymentAction(trimmed, risk)) {
    return deny(ActionRisk.PAYMENT, "payment-related actions are blocked on the dashboard");
  }

  if (!ctx.chat_message) {
    if (hasCommandInjection(trimmed) || hasCommandInjection(String(ctx.command || ""))) {
      return deny(ActionRisk.EXEC, "command injection pattern detected");
    }
  }

  if (risk === ActionRisk.READ) {
    const endpoint = String(ctx.endpoint || "");
    if (endpoint.includes("/tasks")) return allow(ActionRisk.READ, "task read permitted");
    return allow(ActionRisk.READ, "read-only action permitted");
  }

  if (risk === ActionRisk.WRITE) {
    const endpoint = String(ctx.endpoint || "");
    const method = String(ctx.method || "").toUpperCase();
    if (endpoint.includes("/tasks") && (method === "POST" || method === "PATCH")) {
      if (ctx.bulk) return confirm(ActionRisk.WRITE, "bulk task write requires confirmation", trimmed);
      if (method === "POST" && endpoint.replace(/\/$/, "").endsWith("/tasks")) {
        return allow(ActionRisk.WRITE, "single task create permitted");
      }
      if (endpoint.includes("/done") || endpoint.includes("/snooze")) {
        return allow(ActionRisk.WRITE, "task status transition permitted");
      }
      return allow(ActionRisk.WRITE, "single task update permitted");
    }
    if (endpoint.includes("/tasks/") && method === "DELETE") {
      return confirm(ActionRisk.WRITE, "task delete requires confirmation", trimmed);
    }
    const target = String(ctx.path || trimmed).toLowerCase();
    const base = target.split("/").pop();
    if (SENSITIVE_WRITE_NAMES.has(base) || target.includes("agents.md")) {
      return confirm(ActionRisk.WRITE, "writing AGENTS.md requires confirmation", trimmed);
    }
    return confirm(ActionRisk.WRITE, "write action requires confirmation", trimmed);
  }

  if (risk === ActionRisk.NETWORK) {
    return confirm(ActionRisk.NETWORK, "network action requires confirmation", trimmed);
  }

  if (risk === ActionRisk.BROWSER) {
    const loweredAction = trimmed.toLowerCase();
    if (loweredAction.includes("snapshot") || loweredAction.includes("screenshot")) {
      return confirm(ActionRisk.BROWSER, "browser read action requires confirmation", trimmed);
    }
    if (loweredAction.includes("analyze")) {
      return confirm(ActionRisk.BROWSER, "browser analysis requires confirmation", trimmed);
    }
    return confirm(ActionRisk.BROWSER, "browser action requires confirmation", trimmed);
  }

  if (ctx.chat_message) {
    const msg = String(ctx.command || trimmed);
    const { hit, description } = matchesHardline(msg);
    if (hit) return deny(ActionRisk.EXEC, `hardline block: ${description}`);
    return allow(ActionRisk.EXEC, "chat message permitted");
  }

  const command = extractCommand(trimmed, ctx);
  const hardline = matchesHardline(command);
  if (hardline.hit) return deny(ActionRisk.EXEC, `hardline block: ${hardline.description}`);
  if (isWhitelistedCommand(command)) return allow(ActionRisk.EXEC, "whitelisted command permitted");
  if (hasCommandInjection(command)) return deny(ActionRisk.EXEC, "command injection pattern detected");
  return deny(ActionRisk.EXEC, "command not on dashboard whitelist");
}

module.exports = {
  ActionRisk,
  EXEC_WHITELIST,
  classifyAction,
  isWhitelistedCommand,
  toDict,
};
