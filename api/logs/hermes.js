const { cors } = require("../_openrouter");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  cors(res);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(200).send([
    "Vercel cloud mode",
    "Hermes local subprocess logs are not available in serverless mode.",
    "Use Vercel deployment logs for /api/* function diagnostics.",
  ].join("\n"));
};
