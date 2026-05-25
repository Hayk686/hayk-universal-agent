const { callOpenRouter, cors, json, readBody } = require("../_openrouter");
const { enforcePolicy } = require("../lib/policy-enforce");
const { EXEC_WHITELIST } = require("../lib/policy-gate");

const commands = [...EXEC_WHITELIST];

function routeName(req) {
  const pathname = new URL(req.url || "/", "https://local.invalid").pathname;
  return pathname.replace(/^\/api\/commands\/?/, "").replace(/\/$/, "");
}

async function runCloudCommand(command) {
  if (command === "hermes status") {
    return [
      "Hayk Universal Agent: Vercel cloud mode",
      "Runtime: serverless functions",
      "Hermes subprocess: unavailable on Vercel",
      "Chat: /api/chat/* via OpenRouter (PolicyGate enabled)",
      "Workspace docs: GitHub Contents API",
    ].join("\n");
  }

  if (command === "hermes doctor") {
    const checks = [
      ["OPENROUTER_API_KEY", Boolean(process.env.OPENROUTER_API_KEY)],
      ["NVIDIA_API_KEY", Boolean(process.env.NVIDIA_API_KEY)],
      ["AGENT_LLM_PROVIDER", process.env.AGENT_LLM_PROVIDER || "openrouter"],
      ["GITHUB_TOKEN", Boolean(process.env.GITHUB_TOKEN)],
      ["GITHUB_REPO", Boolean(process.env.GITHUB_REPO)],
      ["GITHUB_BRANCH", Boolean(process.env.GITHUB_BRANCH)],
      ["AGENT_WORKHORSE_MODEL", Boolean(process.env.AGENT_WORKHORSE_MODEL)],
      ["AGENT_WEB_MODEL", Boolean(process.env.AGENT_WEB_MODEL)],
      ["POLICY_HMAC_SECRET", Boolean(process.env.POLICY_HMAC_SECRET)],
      ["VITE_USE_MOCKS", "checked at frontend build time"],
    ];
    return checks
      .map(([name, ok]) => `${ok === true ? "OK" : ok ? "INFO" : "MISSING"} ${name}${typeof ok === "string" ? `: ${ok}` : ""}`)
      .join("\n");
  }

  const result = await callOpenRouter("Say exactly: OK");
  return result.text.trim();
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }

  const route = routeName(req);
  if (route === "whitelist" && req.method === "GET") {
    return json(res, 200, { commands });
  }
  if (route !== "run" || req.method !== "POST") {
    return json(res, 404, { detail: "Command route not found" });
  }

  const body = readBody(req);
  const command = String(body.command || "").trim();
  const action = `exec ${command}`;
  const gate = enforcePolicy({
    req,
    res,
    json,
    action,
    context: { endpoint: "/api/commands/run", kind: "exec", command },
    confirmationToken:
      typeof body.policyConfirmationToken === "string" ? body.policyConfirmationToken.trim() : null,
  });
  if (!gate.allowed) return;

  if (!EXEC_WHITELIST.has(command)) {
    return json(res, 400, { detail: "Command is not in the whitelist" });
  }
  try {
    return json(res, 200, {
      exitCode: 0,
      output: await runCloudCommand(command),
    });
  } catch (error) {
    console.error("command run failed", {
      message: error.message || String(error),
      providerStatus: error.providerStatus,
      model: error.model,
    });
    return json(res, error.statusCode || 500, {
      exitCode: 1,
      output: error.message || String(error),
      detail: error.message || String(error),
    });
  }
};
