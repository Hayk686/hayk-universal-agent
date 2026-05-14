const { cors, json } = require("./_openrouter");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  return json(res, 200, { status: "ok" });
};
