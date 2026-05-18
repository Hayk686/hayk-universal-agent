const { cors, json } = require("../_openrouter");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  return json(res, 501, {
    detail: "Browser upload is not enabled in Vercel cloud mode yet. Edit AGENTS.md and playbooks from the browser, or commit workspace files through GitHub.",
  });
};
