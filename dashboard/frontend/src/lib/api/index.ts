/**
 * Typed API surface — FastAPI by default; mocks when VITE_USE_MOCKS is set.
 */

import type {
  ChatSendResponse,
  ChatSessionSendResponse,
  ChatSessionTranscriptResponse,
  ChatSessionListResponse,
  ChatWebSendResponse,
  CommandRunResponse,
  CommandsWhitelistResponse,
  FileEntry,
  FileFolder,
  HealthResponse,
  NewPlaybookRequest,
  OkResponse,
  SaveBodyRequest,
  SaveMarkdownResponse,
  StatusResponse,
} from "../../types/api-contract";
import * as client from "./client";
import * as mocks from "./mocks";

export async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let detail: unknown;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      detail = parsed.detail;
    } catch {
      /* fall through to raw text */
    }
    if (typeof detail === "string") {
      throw new Error(detail);
    }
    throw new Error(text);
  }
  return res.json() as Promise<T>;
}

const uploadUrl = () => `${client.apiBase()}/api/files/upload`;

async function gate<T>(real: () => Promise<T>, mock: () => Promise<T>): Promise<T> {
  if (client.useMocks()) return mock();
  return real();
}

/** How workspace status was resolved — for UI badges when API is unreachable. */
export type StatusOrigin = "live" | "mock-env" | "mock-offline";

/**
 * Load GET /api/status, or mock payload when `VITE_USE_MOCKS` is set.
 * If the real request fails (network, 404, etc.), returns mock data with `mock-offline`
 * so the dashboard still renders; use `liveError` for an inline explanation.
 */
export async function fetchStatus(): Promise<{
  data: StatusResponse;
  origin: StatusOrigin;
  liveError?: string;
}> {
  if (client.useMocks()) {
    return { data: await mocks.mockStatus(), origin: "mock-env" };
  }
  try {
    const data = await client.getJson<StatusResponse>("/api/status");
    return { data, origin: "live" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const liveError = msg.length > 360 ? `${msg.slice(0, 360)}…` : msg;
    return {
      data: await mocks.mockStatus(),
      origin: "mock-offline",
      liveError,
    };
  }
}

export const api = {
  health: () => gate(() => client.getJson<HealthResponse>("/health"), mocks.mockHealth),

  getStatus: async () => (await fetchStatus()).data,

  listFilesInFolder: (folder: FileFolder) =>
    gate(
      () => client.getJson<FileEntry[]>(`/api/files?folder=${encodeURIComponent(folder)}`),
      () => mocks.mockListFiles(folder),
    ),

  uploadToInput: async (file: globalThis.File): Promise<FileEntry> => {
    if (client.useMocks()) return mocks.mockUpload(file);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(uploadUrl(), { method: "POST", body: fd });
    return parseJsonOrThrow<FileEntry>(res);
  },

  deleteFile: (workspaceRelativePath: string) =>
    gate(
      () => client.del(`/api/files?path=${encodeURIComponent(workspaceRelativePath)}`),
      async () => {
        await mocks.mockDeleteFile();
        return new Response(JSON.stringify({ ok: "true" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    ),

  getAgentsMd: () => gate(() => client.getText("/api/agents-md"), mocks.mockAgentsMd),

  saveAgentsMd: (body: SaveBodyRequest) =>
    gate(
      () => client.putJson("/api/agents-md", body),
      async () =>
        new Response(JSON.stringify({ saved: "true", backup: "" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ),

  listPlaybooks: () =>
    gate(() => client.getJson<FileEntry[]>("/api/playbooks"), mocks.mockPlaybooks),

  getPlaybook: (name: string) =>
    gate(
      () => client.getText(`/api/playbooks/${encodeURIComponent(name)}`),
      () => mocks.mockPlaybookBody(name),
    ),

  savePlaybook: (name: string, body: SaveBodyRequest) =>
    gate(
      () => client.putJson(`/api/playbooks/${encodeURIComponent(name)}`, body),
      async () =>
        new Response(JSON.stringify({ saved: "true", backup: "" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ),

  createPlaybook: async (body: NewPlaybookRequest): Promise<FileEntry> => {
    if (client.useMocks()) {
      return mockFileEntry(body.name);
    }
    const res = await client.postJson("/api/playbooks", body);
    return parseJsonOrThrow<FileEntry>(res);
  },

  deletePlaybook: (name: string) =>
    gate(
      () => client.del(`/api/playbooks/${encodeURIComponent(name)}`),
      async () =>
        new Response(JSON.stringify({ ok: "true" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ),

  getLogsHermes: () => gate(() => client.getText("/api/logs/hermes"), mocks.mockLogs),

  getLogsErrors: () => gate(() => client.getText("/api/logs/errors"), mocks.mockLogs),

  getCommandWhitelist: () =>
    gate(
      () => client.getJson<CommandsWhitelistResponse>("/api/commands/whitelist"),
      mocks.mockWhitelist,
    ),

  runWhitelistedCommand: async (command: string): Promise<CommandRunResponse> => {
    if (client.useMocks()) return mocks.mockRunCommand(command);
    const res = await client.postJson("/api/commands/run", { command });
    return parseJsonOrThrow<CommandRunResponse>(res);
  },

  sendSessionChatMessage: (
    message: string,
    sessionId: string | null,
    init?: { signal?: AbortSignal },
  ) =>
    gate(
      async () => {
        const res = await client.postJson(
          "/api/chat/session-send",
          { message, sessionId: sessionId ?? null },
          init,
        );
        return parseJsonOrThrow<ChatSessionSendResponse>(res);
      },
      () => mocks.mockChatSessionSend(message, sessionId),
    ),

  getChatSessionTranscript: (sessionId: string) =>
    gate(
      () =>
        client.getJson<ChatSessionTranscriptResponse>(
          `/api/chat/sessions/${encodeURIComponent(sessionId)}/transcript`,
        ),
      async () => ({
        sessionId,
        title: null,
        messageCount: 0,
        messages: [],
      }),
    ),

  getChatSessions: () =>
    gate(
      () => client.getJson<ChatSessionListResponse>("/api/chat/sessions"),
      async () => ({ sessions: [] }),
    ),

  deleteChatSession: (sessionId: string) =>
    gate(
      () => client.del(`/api/chat/sessions/${encodeURIComponent(sessionId)}`),
      async () =>
        new Response(JSON.stringify({ ok: "true", sessionId }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ),

  sendChatMessage: (message: string, init?: { signal?: AbortSignal }) =>
    gate(
      async () => {
        const res = await client.postJson("/api/chat/send", { message }, init);
        return parseJsonOrThrow<ChatSendResponse>(res);
      },
      () => mocks.mockChatSend(message),
    ),

  sendWebChatMessage: (message: string, init?: { signal?: AbortSignal }) =>
    gate(
      async () => {
        const res = await client.postJson("/api/chat/web-send", { message }, init);
        return parseJsonOrThrow<ChatWebSendResponse>(res);
      },
      async () => {
        const data = await mocks.mockChatSend(message);
        return { ...data, mode: "web-oneshot" as const };
      },
    ),
};

function mockFileEntry(name: string): FileEntry {
  return {
    name,
    path: `playbooks/${name}`,
    size: 32,
    modified: new Date().toISOString(),
    extension: "md",
    isDir: false,
  };
}

/** @deprecated Prefer named export `api`. */
export const apiClient = api;

export async function commandRunFromResponse(
  res: Response,
): Promise<CommandRunResponse> {
  return parseJsonOrThrow<CommandRunResponse>(res);
}

export async function saveMarkdownFromResponse(
  res: Response,
): Promise<SaveMarkdownResponse> {
  return parseJsonOrThrow<SaveMarkdownResponse>(res);
}

export async function okFromResponse(res: Response): Promise<OkResponse> {
  return parseJsonOrThrow<OkResponse>(res);
}

export {
  apiBase,
  useMocks,
  apiFetch,
  getJson,
  getText,
  putJson,
  postJson,
  putText,
  del,
  downloadUrl,
} from "./client";
