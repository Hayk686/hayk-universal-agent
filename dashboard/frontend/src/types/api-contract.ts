/**
 * API shapes aligned with docs/api-contract.md and FastAPI.
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

export type FileFolder = "input" | "output" | "reports";

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
  /** Max seconds the server waits on each Agent Chat Hermes subprocess. */
  chatTimeoutSeconds: number;
};

export type SaveMarkdownResponse = {
  saved: string;
  backup: string;
};

export type OkResponse = {
  ok: string;
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

export type ChatSendResponse = {
  response: string;
  exitCode: number;
  durationMs: number;
  mode: "oneshot";
};

export type ChatWebSendResponse = {
  response: string;
  exitCode: number;
  durationMs: number;
  mode: "web-oneshot";
};

export type ChatSessionSendResponse = {
  response: string;
  sessionId: string | null;
  exitCode: number;
  durationMs: number;
  mode: "hermes-session";
  parseWarning?: string | null;
};

export type ChatSessionTranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: number | null;
};

export type ChatSessionTranscriptResponse = {
  sessionId: string;
  title: string | null;
  messageCount: number;
  messages: ChatSessionTranscriptMessage[];
};

export type ChatSessionListItem = {
  sessionId: string;
  title: string;
  preview: string;
  lastActive: string;
};

export type ChatSessionListResponse = {
  sessions: ChatSessionListItem[];
};

/** Exact strings accepted by POST /api/commands/run (must match backend whitelist). */
export const WHITELIST_SHELL_COMMANDS = {
  hermesStatus: "hermes status",
  hermesDoctor: "hermes doctor",
  hermesPing: 'hermes -z "Say exactly: OK"',
} as const;
