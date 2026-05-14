const { cors, json } = require("../_openrouter");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  if (req.method === "GET") {
    return json(res, 200, { sessions: [] });
  }
  return json(res, 405, { detail: "Method not allowed" });
};
