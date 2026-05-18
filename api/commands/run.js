const { callOpenRouter, cors, json, readBody } = require("../_openrouter");

const WHITELIST = new Set([
  "hermes status",
  "hermes doctor",
  'hermes -z "Say exactly: OK"',
]);

async function runCloudCommand(command) {
  if (command === "hermes status") {
    return [
      "Hayk Universal Agent: Vercel cloud mode",
      "Runtime: serverless functions",
      "Hermes subprocess: unavailable on Vercel",
      "Chat: /api/chat/* via OpenRouter",
      "Workspace docs: GitHub Contents API",
    ].join("\n");
  }

  if (command === "hermes doctor") {
    const checks = [
      ["OPENROUTER_API_KEY", Boolean(process.env.OPENROUTER_API_KEY)],
      ["GITHUB_TOKEN", Boolean(process.env.GITHUB_TOKEN)],
      ["GITHUB_REPO", Boolean(process.env.GITHUB_REPO)],
      ["GITHUB_BRANCH", Boolean(process.env.GITHUB_BRANCH)],
      ["AGENT_WORKHORSE_MODEL", Boolean(process.env.AGENT_WORKHORSE_MODEL)],
      ["AGENT_WEB_MODEL", Boolean(process.env.AGENT_WEB_MODEL)],
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
  if (req.method !== "POST") {
    return json(res, 405, { detail: "Method not allowed" });
  }
  const command = String(readBody(req).command || "").trim();
  if (!WHITELIST.has(command)) {
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
