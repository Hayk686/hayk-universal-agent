const { cors, json } = require("./_openrouter");
const { getContentFile, putContentFile } = require("./_github");
const { readText } = require("./_repo");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  if (req.method === "GET") {
    try {
      let content;
      try {
        content = (await getContentFile("agent-workspace/AGENTS.md")).content;
      } catch (error) {
        if (error.statusCode !== 503) throw error;
        content = readText("agent-workspace", "AGENTS.md");
      }
      cors(res);
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      return res.status(200).send(content);
    } catch (error) {
      console.error("agents-md failed", { message: error.message || String(error) });
      return json(res, 500, {
        detail: "AGENTS.md is unavailable in this Vercel function bundle",
        error: error.message || String(error),
      });
    }
  }
  if (req.method === "PUT") {
    try {
      const content = typeof req.body?.content === "string" ? req.body.content : "";
      if (!content.trim()) {
        return json(res, 422, { detail: "content must not be empty" });
      }
      await putContentFile(
        "agent-workspace/AGENTS.md",
        content,
        "Update AGENTS.md from dashboard",
      );
      return json(res, 200, { saved: "true", backup: "" });
    } catch (error) {
      console.error("agents-md save failed", {
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
