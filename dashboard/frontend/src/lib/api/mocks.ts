/**
 * Offline mock payloads aligned with docs/api-contract.ts — no real filesystem paths.
 */

import type {
  ChatSendResponse,
  ChatSessionSendResponse,
  CommandRunResponse,
  CommandsWhitelistResponse,
  FileEntry,
  FileFolder,
  HealthResponse,
  OkResponse,
  StatusResponse,
} from "../../types/api-contract";
import { WHITELIST_SHELL_COMMANDS } from "../../types/api-contract";

const MOCK_WORKSPACE_LABEL =
  "(mock — set VITE_USE_MOCKS=false to use the API; no real path)";

function iso(minutesAgo = 0): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

export function mockHealth(): Promise<HealthResponse> {
  return Promise.resolve({ status: "ok" });
}

export function mockStatus(): Promise<StatusResponse> {
  // Mock payload now uses obviously-zero counters so a preview deployment
  // cannot be mistaken for a healthy live system. Disk usage is reported as
  // ``0`` rather than a fake "128GB free" number.
  return Promise.resolve({
    agentName: "Hayk Agent (mock — backend unavailable)",
    workspacePath: MOCK_WORKSPACE_LABEL,
    serverTime: new Date().toISOString(),
    agentsMdExists: false,
    playbooksDirExists: false,
    fileCounts: { input: 0, output: 0, reports: 0 },
    diskUsage: {
      totalBytes: 0,
      usedBytes: 0,
      freeBytes: 0,
      workspaceBytes: 0,
    },
    venv: {
      pythonPath: "(mock — connect FastAPI for live venv path)",
      existsAndExecutable: false,
    },
    chatTimeoutSeconds: 300,
  });
}

function mockFile(folder: FileFolder, name: string, i: number): FileEntry {
  const path = `${folder}/${name}`;
  return {
    name,
    path,
    size: 1024 * (i + 1),
    modified: iso(i * 5),
    extension: name.includes(".") ? name.split(".").pop() ?? "file" : "file",
    isDir: false,
  };
}

export function mockListFiles(folder: FileFolder): Promise<FileEntry[]> {
  const samples: Record<FileFolder, string[]> = {
    input: ["brief.md", "notes.txt"],
    output: ["result.json"],
    reports: ["weekly.md", "summary.csv", "audit.md"],
  };
  return Promise.resolve(
    samples[folder].map((name, i) => mockFile(folder, name, i)),
  );
}

export function mockAgentsMd(): Promise<string> {
  return Promise.resolve("# AGENTS.md (mock)\n\nStatic preview content.\n");
}

export function mockLogs(): Promise<string> {
  return Promise.resolve("[mock] hermes logs — connect to the API for live output.\n");
}

export function mockWhitelist(): Promise<CommandsWhitelistResponse> {
  return Promise.resolve({
    commands: [
      WHITELIST_SHELL_COMMANDS.hermesStatus,
      WHITELIST_SHELL_COMMANDS.hermesDoctor,
      WHITELIST_SHELL_COMMANDS.hermesPing,
      "pwd",
    ],
  });
}

export function mockRunCommand(command: string): Promise<CommandRunResponse> {
  return Promise.resolve({
    exitCode: 0,
    output: `[mock] Would run:\n${command}\n`,
  });
}

let _mockSessionSeq = 0;

export function mockChatSessionSend(
  message: string,
  sessionId: string | null,
): Promise<ChatSessionSendResponse> {
  const sid = sessionId ?? `mock_sess_${++_mockSessionSeq}`;
  const preview =
    message.length > 80 ? `${message.slice(0, 80)}…` : message;
  return Promise.resolve({
    response: `[mock persistent] ${preview}`,
    sessionId: sid,
    exitCode: 0,
    durationMs: 15,
    mode: "hermes-session",
    parseWarning: null,
  });
}

export function mockChatSend(message: string): Promise<ChatSendResponse> {
  const preview =
    message.length > 120 ? `${message.slice(0, 120)}…` : message;
  return Promise.resolve({
    response: `[mock] Echo for: ${preview}\n`,
    exitCode: 0,
    durationMs: 12,
    mode: "oneshot",
  });
}

export function mockUpload(_file: globalThis.File): Promise<FileEntry> {
  return Promise.resolve(
    mockFile("input", _file.name || "upload.bin", 0),
  );
}

export function mockPlaybooks(): Promise<FileEntry[]> {
  const now = new Date().toISOString();
  return Promise.resolve([
    {
      name: "sample.md",
      path: "playbooks/sample.md",
      size: 120,
      modified: now,
      extension: "md",
      isDir: false,
    },
    {
      name: "demo.md",
      path: "playbooks/demo.md",
      size: 200,
      modified: now,
      extension: "md",
      isDir: false,
    },
  ]);
}

export function mockPlaybookBody(name: string): Promise<string> {
  return Promise.resolve(`# ${name}\n\n(mock content)\n`);
}

export function mockDeleteFile(): Promise<OkResponse> {
  return Promise.resolve({ ok: "true" });
}
