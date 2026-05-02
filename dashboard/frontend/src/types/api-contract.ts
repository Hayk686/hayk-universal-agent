/**
 * API shapes aligned with docs/api-contract.md and FastAPI.
 * Change together with backend and docs.
 */

export type HealthResponse = {
  status: string;
};

export type FileEntry = {
  name: string;
  path: string;
  size: number;
  modified: string;
  extension: string;
  isDir: boolean;
};

export type StatusResponse = {
  agentName: string;
  workspacePath: string;
  serverTime: string;
  agentsMdExists: boolean;
  playbooksDirExists: boolean;
  fileCounts: {
    input: number;
    output: number;
    reports: number;
  };
  diskUsage: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    workspaceBytes: number;
  };
  venv: {
    pythonPath: string;
    existsAndExecutable: boolean;
  };
};

export type FilesListResponse = {
  input: FileEntry[];
  output: FileEntry[];
  reports: FileEntry[];
};

export type SaveMarkdownResponse = {
  saved: string;
  backup: string;
};

export type OkResponse = {
  ok: string;
};

export type HermesRunVariant = "status" | "doctor" | "ping";

export type HermesRunRequest = {
  variant: HermesRunVariant;
};

export type CommandRunResponse = {
  exitCode: number;
  output: string;
};

export type CommandsWhitelistResponse = {
  commands: string[];
};

export type NewPlaybookRequest = {
  name: string;
};

export type SaveBodyRequest = {
  content: string;
};

export type LogKind = "since1h" | "errors";
