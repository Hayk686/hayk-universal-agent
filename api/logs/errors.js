const { cors } = require("../_openrouter");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  cors(res);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(200).send([
    "No bundled error log in Vercel cloud mode.",
    "Open Vercel > Deployments > Logs to inspect live function errors.",
  ].join("\n"));
};
