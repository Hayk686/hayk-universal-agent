const { cors, json } = require("../_openrouter");
const { isSafeMarkdownName, readText } = require("../_repo");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }

  const name = req.query?.name;
  if (!isSafeMarkdownName(name)) {
    return json(res, 400, { detail: "Invalid playbook name" });
  }

  if (req.method === "GET") {
    try {
      cors(res);
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      return res.status(200).send(readText("agent-workspace", "playbooks", name));
    } catch {
      return json(res, 404, { detail: "Not found" });
    }
  }

  return json(res, 405, {
    detail: "Playbooks are read-only in Vercel cloud mode. Edit them in GitHub and redeploy.",
  });
};
