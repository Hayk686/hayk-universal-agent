const { cors, json } = require("./_openrouter");
const { deleteContentFile, getContentFile, githubFileEntry, listContentDir } = require("./_github");
const { fileEntry, repoPath } = require("./_repo");
const fs = require("fs");
const path = require("path");

const FOLDERS = new Set(["input", "output", "reports"]);

function safeFolder(value) {
  const folder = String(value || "");
  return FOLDERS.has(folder) ? folder : null;
}

function safeWorkspacePath(value) {
  const rel = String(value || "").replace(/\\/g, "/");
  const [folder] = rel.split("/");
  if (!FOLDERS.has(folder) || rel.includes("..") || rel.startsWith("/")) return null;
  return rel;
}

async function listFolder(folder) {
  try {
    return (await listContentDir(`agent-workspace/${folder}`))
      .filter((item) => item.type === "file")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(githubFileEntry);
  } catch (error) {
    if (error.statusCode === 404) return [];
    if (error.statusCode !== 503) throw error;
    const dir = repoPath("agent-workspace", folder);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => fileEntry(path.join(dir, name), repoPath("agent-workspace")));
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }

  if (req.method === "GET") {
    try {
      const folder = safeFolder(req.query?.folder);
      if (!folder) return json(res, 400, { detail: "folder must be input, output, or reports" });
      return json(res, 200, await listFolder(folder));
    } catch (error) {
      console.error("files list failed", { message: error.message || String(error) });
      return json(res, error.statusCode || 500, { detail: error.message || String(error) });
    }
  }

  if (req.method === "DELETE") {
    try {
      const rel = safeWorkspacePath(req.query?.path);
      if (!rel) return json(res, 400, { detail: "Invalid workspace path" });
      await deleteContentFile(`agent-workspace/${rel}`, `Delete ${rel} from dashboard`);
      return json(res, 200, { ok: "true" });
    } catch (error) {
      console.error("file delete failed", {
        message: error.message || String(error),
        githubStatus: error.githubStatus,
      });
      return json(res, error.statusCode || 500, {
        detail: error.message || String(error),
        githubStatus: error.githubStatus || null,
      });
    }
  }

  return json(res, 405, { detail: "Method not allowed" });
};

module.exports.safeWorkspacePath = safeWorkspacePath;
