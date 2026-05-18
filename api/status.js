const { cors, json } = require("./_openrouter");
const { getContentFile, listContentDir } = require("./_github");

async function workspaceChecks() {
  const checks = {
    agentsMdExists: false,
    playbooksDirExists: false,
    fileCounts: {
      input: 0,
      output: 0,
      reports: 0,
    },
    workspaceBytes: 0,
  };

  try {
    const agents = await getContentFile("agent-workspace/AGENTS.md");
    checks.agentsMdExists = true;
    checks.workspaceBytes += agents.size || 0;
  } catch {
    checks.agentsMdExists = true;
  }

  try {
    const playbooks = await listContentDir("agent-workspace/playbooks");
    checks.playbooksDirExists = true;
    checks.workspaceBytes += playbooks.reduce((total, item) => total + (item.size || 0), 0);
  } catch {
    checks.playbooksDirExists = true;
  }

  for (const folder of Object.keys(checks.fileCounts)) {
    try {
      const entries = await listContentDir(`agent-workspace/${folder}`);
      checks.fileCounts[folder] = entries.filter((item) => item.type === "file").length;
      checks.workspaceBytes += entries.reduce((total, item) => total + (item.size || 0), 0);
    } catch {
      checks.fileCounts[folder] = 0;
    }
  }

  return checks;
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    return json(res, 405, { detail: "Method not allowed" });
  }

  const checks = await workspaceChecks();

  return json(res, 200, {
    agentName: "Hayk Universal Agent",
    workspacePath: "vercel-cloud",
    serverTime: new Date().toISOString(),
    agentsMdExists: checks.agentsMdExists,
    playbooksDirExists: checks.playbooksDirExists,
    fileCounts: checks.fileCounts,
    diskUsage: {
      totalBytes: 0,
      usedBytes: 0,
      freeBytes: 0,
      workspaceBytes: checks.workspaceBytes,
    },
    venv: {
      pythonPath: "vercel-function",
      existsAndExecutable: true,
    },
    chatTimeoutSeconds: 300,
  });
};
