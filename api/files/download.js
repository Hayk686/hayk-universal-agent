const { cors, json } = require("../_openrouter");
const { getContentFile } = require("../_github");
const { safeWorkspacePath } = require("../files");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    return json(res, 405, { detail: "Method not allowed" });
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
