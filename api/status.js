const { cors, json } = require("./_openrouter");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    return json(res, 405, { detail: "Method not allowed" });
  }

  return json(res, 200, {
    agentName: "Hayk Universal Agent",
    workspacePath: "vercel-cloud",
    serverTime: new Date().toISOString(),
    agentsMdExists: false,
    playbooksDirExists: false,
    fileCounts: {
      input: 0,
      output: 0,
      reports: 0,
    },
    diskUsage: {
      totalBytes: 0,
      usedBytes: 0,
      freeBytes: 0,
      workspaceBytes: 0,
    },
    venv: {
      pythonPath: "vercel-function",
      existsAndExecutable: true,
    },
    chatTimeoutSeconds: 300,
  });
};
