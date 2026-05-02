/**
 * Typed HTTP client for docs/api-contract.md.
 * Lovable prototypes should mirror these methods when calling the real API.
 */

import {
  del,
  downloadUrl,
  getJson,
  getText,
  postJson,
  putJson,
} from "./api";
import type {
  CommandRunResponse,
  CommandsWhitelistResponse,
  FileEntry,
  FilesListResponse,
  HealthResponse,
  HermesRunRequest,
  LogKind,
  NewPlaybookRequest,
  OkResponse,
  SaveBodyRequest,
  SaveMarkdownResponse,
  StatusResponse,
} from "../types/api-contract";

export { downloadUrl };

export async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

const uploadUrl = () => `${import.meta.env.VITE_API_BASE ?? ""}/api/files/upload`;

export const apiClient = {
  health: () => getJson<HealthResponse>("/health"),

  getStatus: () => getJson<StatusResponse>("/api/status"),

  listFiles: () => getJson<FilesListResponse>("/api/files/list"),

  uploadToInput: async (file: globalThis.File): Promise<FileEntry> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(uploadUrl(), { method: "POST", body: fd });
    return parseJsonOrThrow<FileEntry>(res);
  },

  deleteFile: (workspaceRelativePath: string) =>
    del(`/api/files?path=${encodeURIComponent(workspaceRelativePath)}`),

  getAgentsMd: () => getText("/api/agents-md"),

  saveAgentsMd: (body: SaveBodyRequest) => putJson("/api/agents-md", body),

  listPlaybooks: () => getJson<FileEntry[]>("/api/playbooks"),

  getPlaybook: (name: string) =>
    getText(`/api/playbooks/${encodeURIComponent(name)}`),

  savePlaybook: (name: string, body: SaveBodyRequest) =>
    putJson(`/api/playbooks/${encodeURIComponent(name)}`, body),

  createPlaybook: async (body: NewPlaybookRequest): Promise<FileEntry> => {
    const res = await postJson("/api/playbooks", body);
    return parseJsonOrThrow<FileEntry>(res);
  },

  deletePlaybook: (name: string) =>
    del(`/api/playbooks/${encodeURIComponent(name)}`),

  runHermes: async (body: HermesRunRequest): Promise<CommandRunResponse> => {
    const res = await postJson("/api/hermes/run", body);
    return parseJsonOrThrow<CommandRunResponse>(res);
  },

  getLogs: (kind: LogKind) => getText(`/api/logs/${kind}`),

  getCommandWhitelist: () =>
    getJson<CommandsWhitelistResponse>("/api/commands/whitelist"),

  runWhitelistedCommand: async (command: string): Promise<CommandRunResponse> => {
    const res = await postJson("/api/commands/run", { command });
    return parseJsonOrThrow<CommandRunResponse>(res);
  },
};

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
