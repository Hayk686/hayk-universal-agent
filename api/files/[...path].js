const { cors, json } = require("../_openrouter");
const { getContentFile } = require("../_github");
const { safeWorkspacePath } = require("../files");

function routeName(req) {
  const pathname = new URL(req.url || "/", "https://local.invalid").pathname;
  return pathname.replace(/^\/api\/files\/?/, "").replace(/\/$/, "");
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }

  const route = routeName(req);
  if (route === "upload") {
    return json(res, 501, {
      detail: "Browser upload is not enabled in Vercel cloud mode yet. Edit AGENTS.md and playbooks from the browser, or commit workspace files through GitHub.",
    });
  }

  if (route !== "download" || req.method !== "GET") {
    return json(res, 404, { detail: "Files route not found" });
  }

  try {
    const rel = safeWorkspacePath(req.query?.path);
    if (!rel) return json(res, 400, { detail: "Invalid workspace path" });
    const file = await getContentFile(`agent-workspace/${rel}`);
    cors(res);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${file.name}"`);
    return res.status(200).send(file.content);
  } catch (error) {
    console.error("file download failed", { message: error.message || String(error) });
    return json(res, error.statusCode || 500, { detail: error.message || String(error) });
  }
};
