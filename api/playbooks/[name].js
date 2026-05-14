const { cors, json } = require("../_openrouter");
const { deleteContentFile, getContentFile, putContentFile } = require("../_github");
const { isSafeMarkdownName, readText } = require("../_repo");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }

  const name = req.query?.name;
  if (!isSafeMarkdownName(name)) {
    return json(res, 400, { detail: "Invalid playbook name" });
  }

  if (req.method === "GET") {
    try {
      let content;
      try {
        content = (await getContentFile(`agent-workspace/playbooks/${name}`)).content;
      } catch (error) {
        if (error.statusCode !== 503) throw error;
        content = readText("agent-workspace", "playbooks", name);
      }
      cors(res);
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      return res.status(200).send(content);
    } catch (error) {
      return json(res, error.statusCode || 404, { detail: error.message || "Not found" });
    }
  }

  if (req.method === "PUT") {
    try {
      const content = typeof req.body?.content === "string" ? req.body.content : "";
      if (!content.trim()) {
        return json(res, 422, { detail: "content must not be empty" });
      }
      await putContentFile(
        `agent-workspace/playbooks/${name}`,
        content,
        `Update playbook ${name} from dashboard`,
      );
      return json(res, 200, { saved: "true", backup: "" });
    } catch (error) {
      console.error("playbook save failed", {
        name,
        message: error.message || String(error),
        githubStatus: error.githubStatus,
      });
      return json(res, error.statusCode || 500, {
        detail: error.message || String(error),
        githubStatus: error.githubStatus || null,
      });
    }
  }

  if (req.method === "DELETE") {
    try {
      await deleteContentFile(
        `agent-workspace/playbooks/${name}`,
        `Delete playbook ${name} from dashboard`,
      );
      return json(res, 200, { ok: "true" });
    } catch (error) {
      console.error("playbook delete failed", {
        name,
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
