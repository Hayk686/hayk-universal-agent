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
  // Vercel serverless cannot tail the local Hermes subprocess logs. Returning
  // a friendly 200 with explanatory text used to mask the fact that the
  // endpoint is non-functional in cloud mode; the UI then rendered a useless
  // "logs available" panel. We now answer with 501 + clear JSON so the
  // frontend can show a real "feature unavailable" badge.
  if (route === "hermes" || route === "errors") {
    return json(res, 501, {
      detail:
        `${route === "hermes" ? "Hermes runtime logs" : "Hermes error logs"} are not available ` +
        "in Vercel cloud mode. Set BACKEND_URL (PC proxy) or VITE_API_BASE_URL to a FastAPI " +
        "tunnel URL to stream live logs. Vercel function logs themselves live in the Vercel " +
        "dashboard (Deployments → Logs).",
      mode: "vercel-cloud",
      route,
    });
  }
  return json(res, 404, { detail: "Log route not found", route });
};
