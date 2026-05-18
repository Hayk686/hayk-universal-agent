const { cors, json } = require("../_openrouter");

function routeName(req) {
  const pathname = new URL(req.url || "/", "https://local.invalid").pathname;
  return pathname.replace(/^\/api\/logs\/?/, "").replace(/\/$/, "");
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    return json(res, 405, { detail: "Method not allowed" });
  }

  const route = routeName(req);
  cors(res);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  if (route === "hermes") {
    return res.status(200).send([
      "Vercel cloud mode",
      "Hermes local subprocess logs are not available in serverless mode.",
      "Use Vercel deployment logs for /api/* function diagnostics.",
    ].join("\n"));
  }
  if (route === "errors") {
    return res.status(200).send([
      "No bundled error log in Vercel cloud mode.",
      "Open Vercel > Deployments > Logs to inspect live function errors.",
    ].join("\n"));
  }
  return res.status(404).send("Log route not found");
};
