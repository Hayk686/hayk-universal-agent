const DEFAULT_REPO = "Hayk686/hayk-universal-agent";
const DEFAULT_BRANCH = "main";

function githubConfig() {
  return {
    token: process.env.GITHUB_TOKEN || "",
    repo: process.env.GITHUB_REPO || DEFAULT_REPO,
    branch: process.env.GITHUB_BRANCH || DEFAULT_BRANCH,
  };
}

function requireToken() {
  const { token } = githubConfig();
  if (!token) {
    const err = new Error("GITHUB_TOKEN is not set in Vercel environment variables");
    err.statusCode = 503;
    throw err;
  }
  return token;
}

function encodeContent(content) {
  return Buffer.from(content, "utf8").toString("base64");
}

function decodeContent(content) {
  return Buffer.from(String(content || ""), "base64").toString("utf8");
}

async function githubRequest(apiPath, init = {}) {
  const { repo } = githubConfig();
  const token = requireToken();
  const response = await fetch(`https://api.github.com/repos/${repo}${apiPath}`, {
    ...init,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const detail = payload?.message || text || `GitHub API HTTP ${response.status}`;
    const err = new Error(String(detail));
    err.statusCode = response.status;
    err.githubStatus = response.status;
    throw err;
  }
  return payload;
}

async function getContentFile(filePath) {
  const { branch } = githubConfig();
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const payload = await githubRequest(`/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`);
  if (Array.isArray(payload) || payload.type !== "file") {
    const err = new Error(`${filePath} is not a file`);
    err.statusCode = 404;
    throw err;
  }
  return {
    content: decodeContent(payload.content),
    sha: payload.sha,
    name: payload.name,
    path: payload.path,
    size: payload.size || 0,
  };
}

async function listContentDir(dirPath) {
  const { branch } = githubConfig();
  const encodedPath = dirPath.split("/").map(encodeURIComponent).join("/");
  const payload = await githubRequest(`/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`);
  if (!Array.isArray(payload)) {
    const err = new Error(`${dirPath} is not a directory`);
    err.statusCode = 404;
    throw err;
  }
  return payload;
}

async function putContentFile(filePath, content, message) {
  const { branch } = githubConfig();
  let sha;
  try {
    const current = await getContentFile(filePath);
    sha = current.sha;
  } catch (error) {
    if (error.statusCode !== 404) throw error;
  }
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  return githubRequest(`/contents/${encodedPath}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: encodeContent(content),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
}

async function deleteContentFile(filePath, message) {
  const { branch } = githubConfig();
  const current = await getContentFile(filePath);
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  return githubRequest(`/contents/${encodedPath}`, {
    method: "DELETE",
    body: JSON.stringify({
      message,
      sha: current.sha,
      branch,
    }),
  });
}

function githubFileEntry(item) {
  const name = item.name || "";
  const rel = String(item.path || "").replace(/^agent-workspace\//, "");
  const ext = name.includes(".") ? name.split(".").pop() : "file";
  return {
    name,
    path: rel,
    size: item.size || 0,
    modified: new Date().toISOString(),
    extension: ext,
    isDir: item.type === "dir",
  };
}

module.exports = {
  deleteContentFile,
  getContentFile,
  githubFileEntry,
  listContentDir,
  putContentFile,
};
