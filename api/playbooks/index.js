const fs = require("fs");
const { cors, json } = require("../_openrouter");
const { githubFileEntry, listContentDir, putContentFile } = require("../_github");
const { fileEntry, repoPath } = require("../_repo");
const { isSafeMarkdownName } = require("../_repo");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  if (req.method === "GET") {
    try {
      let entries;
      try {
        entries = (await listContentDir("agent-workspace/playbooks"))
          .filter((item) => item.type === "file" && item.name.endsWith(".md"))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(githubFileEntry);
      } catch (error) {
        if (error.statusCode !== 503) throw error;
        const dir = repoPath("agent-workspace", "playbooks");
        entries = fs
          .readdirSync(dir)
          .filter((name) => name.endsWith(".md"))
          .sort((a, b) => a.localeCompare(b))
          .map((name) => fileEntry(repoPath("agent-workspace", "playbooks", name)));
      }
      return json(res, 200, entries);
    } catch (error) {
      console.error("playbooks list failed", { message: error.message || String(error) });
      return json(res, 500, {
        detail: "Playbooks are unavailable in this Vercel function bundle",
        error: error.message || String(error),
      });
    }
  }
  if (req.method === "POST") {
    try {
      const name = req.body?.name;
      if (!isSafeMarkdownName(name)) {
        return json(res, 400, { detail: "Invalid playbook name" });
      }
      const filePath = `agent-workspace/playbooks/${name}`;
      await putContentFile(filePath, "# New playbook\n\n", `Create playbook ${name} from dashboard`);
      return json(res, 200, githubFileEntry({
        name,
        path: filePath,
        size: "# New playbook\n\n".length,
        type: "file",
      }));
    } catch (error) {
      console.error("playbook create failed", {
        message: error.message || String(error),
        githubStatus: error.githubStatus,
      });
      return json(res, error.statusCode || 500, {
        detail: error.message || String(error),
        githubStatus: error.githubStatus || null,
      });
    }
  }
  return json(res, 405, { detail: "Method not allowed" });
};
