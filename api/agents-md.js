const { cors, json } = require("./_openrouter");
const { readText } = require("./_repo");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  if (req.method === "GET") {
    cors(res);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    return res.status(200).send(readText("agent-workspace", "AGENTS.md"));
  }
  return json(res, 405, {
    detail: "AGENTS.md is read-only in Vercel cloud mode. Edit it in GitHub and redeploy.",
  });
};
