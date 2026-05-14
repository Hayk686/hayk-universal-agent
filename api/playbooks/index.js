const fs = require("fs");
const { cors, json } = require("../_openrouter");
const { fileEntry, repoPath } = require("../_repo");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  if (req.method === "GET") {
    const dir = repoPath("agent-workspace", "playbooks");
    const entries = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => fileEntry(repoPath("agent-workspace", "playbooks", name)));
    return json(res, 200, entries);
  }
  return json(res, 405, {
    detail: "Playbooks are read-only in Vercel cloud mode. Edit them in GitHub and redeploy.",
  });
};
