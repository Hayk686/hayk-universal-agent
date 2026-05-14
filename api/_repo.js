const fs = require("fs");
const path = require("path");

function repoPath(...parts) {
  return path.join(process.cwd(), ...parts);
}

function readText(...parts) {
  return fs.readFileSync(repoPath(...parts), "utf8");
}

function fileEntry(filePath, workspaceRoot = repoPath("agent-workspace")) {
  const abs = path.isAbsolute(filePath) ? filePath : repoPath(filePath);
  const stat = fs.statSync(abs);
  const rel = path.relative(workspaceRoot, abs).replace(/\\/g, "/");
  const ext = path.extname(abs).replace(/^\./, "") || "file";
  return {
    name: path.basename(abs),
    path: rel,
    size: stat.size,
    modified: stat.mtime.toISOString(),
    extension: ext,
    isDir: stat.isDirectory(),
  };
}

function isSafeMarkdownName(name) {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*\.md$/.test(String(name || ""));
}

module.exports = {
  fileEntry,
  isSafeMarkdownName,
  readText,
  repoPath,
};
