/**
 * Typed API surface — FastAPI by default; mocks when VITE_USE_MOCKS is set.
 */

import type {
  ActiveContextResponse,
  ActiveContextUpdateRequest,
  ArtifactsListResponse,
  ArtifactRecordResponse,
  CapabilitiesResponse,
  ChatSendResponse,
  MemorySummaryResponse,
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
  OrchestrationExecuteRequest,
  OrchestrationListResponse,
  OrchestrationPlanRequest,
  PolicyCheckRequest,
  PolicyConfirmResponse,
  PolicyDecisionResponse,
  SaveBodyRequest,
  SaveMarkdownResponse,
  StatusResponse,
  TaskCreateRequest,
  TaskResponse,
  TasksListResponse,
  TaskSnoozeRequest,
  TaskUpdateRequest,
  WorkflowStateResponse,
  ResearchQueryRequest,
  ResearchResultResponse,
  BrowserActionRequest,
  BrowserActionResultResponse,
  BrowserSessionsResponse,
} from "../../types/api-contract";
import {
  PolicyConfirmationRequiredError,
  extractPolicyChallengeFromText,
} from "../policy/errors";
import { formatKernelApiError } from "../kernel-backend";
import * as client from "./client";
import * as mocks from "./mocks";
import { isKernelBackendAvailable } from "../kernel-backend";

export type ApiRequestInit = Pick<RequestInit, "signal"> & {
  policyConfirmationToken?: string;
};

export async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    const policyChallenge = extractPolicyChallengeFromText(text);
    if (policyChallenge) {
      throw new PolicyConfirmationRequiredError(policyChallenge);
    }
    let detail: unknown;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      detail = parsed.detail;
    } catch {
      /* fall through to raw text */
    }
    if (typeof detail === "string") {
      throw new Error(formatKernelApiError(detail));
    }
    throw new Error(formatKernelApiError(text || `HTTP ${res.status}`));
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.trim().slice(0, 120);
    if (preview.startsWith("<")) {
      throw new Error(
        "API returned HTML instead of JSON. Set VITE_API_BASE_URL to the FastAPI backend, or set VITE_USE_MOCKS=true for a frontend-only Vercel preview.",
      );
    }
    throw new Error(`API returned invalid JSON: ${preview || "(empty response)"}`);
  }
}

const uploadUrl = () => `${client.apiBase()}/api/files/upload`;

async function gate<T>(real: () => Promise<T>, mock: () => Promise<T>): Promise<T> {
  if (client.useMocks()) return mock();
  return real();
}

/** How workspace status was resolved — for UI badges when API is unreachable. */
export type StatusOrigin = "live" | "mock-env" | "mock-offline";

export type CapabilitiesOrigin = "live" | "mock-env";

const MOCK_CAPABILITIES: CapabilitiesResponse = {
  policyGate: true,
  observability: true,
  memoryIndex: true,
  artifactsIndex: true,
  contextRouter: true,
  toolExecutor: true,
  researchPipeline: true,
  browserDriver: true,
  dailyTasks: true,
  orchestrator: true,
};

/** Vercel cloud API without BACKEND_URL / VITE_API_BASE_URL. */
const VERCEL_CLOUD_CAPABILITIES: CapabilitiesResponse = {
  policyGate: true,
  observability: true,
  memoryIndex: false,
  artifactsIndex: false,
  contextRouter: false,
  toolExecutor: false,
  researchPipeline: false,
  browserDriver: false,
  dailyTasks: false,
  orchestrator: false,
};

function formatCapabilitiesError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("Backend unreachable")
  ) {
    const base = client.apiBase();
    if (!base) {
      return (
        "Backend unreachable — start FastAPI on port 8080 or set VITE_API_BASE_URL to your PC/tunnel HTTPS URL."
      );
    }
    return `Backend unreachable at ${base} — verify FastAPI is running and CORS allows this origin.`;
  }
  if (msg.includes("HTML instead of JSON")) {
    return (
      "API returned HTML instead of JSON. Set VITE_API_BASE_URL, BACKEND_URL on Vercel, " +
      "or paste your tunnel URL below."
    );
  }
  if (msg.includes("BACKEND_URL is not set")) {
    return msg;
  }
  if (/\b404\b/.test(msg) || /not found/i.test(msg)) {
    return (
      "GET /api/capabilities not found — set VITE_API_BASE_URL, BACKEND_URL on Vercel (PC proxy), " +
      "or paste your FastAPI tunnel URL below."
    );
  }
  return msg.length > 240 ? `${msg.slice(0, 240)}…` : msg;
}

/**
 * Load GET /api/capabilities with actionable errors (no silent mock fallback).
 * Toggles must reflect server truth; callers show `error` and offer retry when set.
 */
export async function fetchCapabilities(): Promise<{
  data: CapabilitiesResponse | null;
  origin: CapabilitiesOrigin;
  error?: string;
}> {
  if (client.useMocks()) {
    return { data: MOCK_CAPABILITIES, origin: "mock-env" };
  }

  const tryLoad = async (useProxy: boolean) => {
    client.setPcProxy(useProxy);
    return client.getJson<CapabilitiesResponse>("/api/capabilities");
  };

  if (client.apiBase()) {
    try {
      const data = await tryLoad(false);
      return { data, origin: "live" };
    } catch (e) {
      client.setPcProxy(false);
      return { data: null, origin: "live", error: formatCapabilitiesError(e) };
    }
  }

  try {
    const data = await tryLoad(true);
    if (isKernelBackendAvailable(data)) {
      return { data, origin: "live" };
    }
    client.setPcProxy(false);
    return { data, origin: "live" };
  } catch (e) {
    client.setPcProxy(false);
    const msg = formatCapabilitiesError(e);
    if (msg.includes("BACKEND_URL is not set")) {
      return { data: VERCEL_CLOUD_CAPABILITIES, origin: "live" };
    }
    return { data: null, origin: "live", error: msg };
  }
}

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

  saveAgentsMd: (body: SaveBodyRequest, init?: ApiRequestInit) =>
    gate(
      () => {
        const payload: SaveBodyRequest & { policyConfirmationToken?: string } = { ...body };
        if (init?.policyConfirmationToken) {
          payload.policyConfirmationToken = init.policyConfirmationToken;
        }
        return client.putJson("/api/agents-md", payload);
      },
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

  runWhitelistedCommand: (
    command: string,
    init?: ApiRequestInit,
  ): Promise<CommandRunResponse> => {
    if (client.useMocks()) return mocks.mockRunCommand(command);
    const body: { command: string; policyConfirmationToken?: string } = { command };
    if (init?.policyConfirmationToken) {
      body.policyConfirmationToken = init.policyConfirmationToken;
    }
    return client.postJson("/api/commands/run", body, init).then((res) => parseJsonOrThrow(res));
  },

  checkPolicy: (body: PolicyCheckRequest) =>
    gate(
      () =>
        client
          .postJson("/api/policy/check", body)
          .then((r) => parseJsonOrThrow<PolicyDecisionResponse>(r)),
      async () => ({
        allowed: true,
        risk: "read" as const,
        requiresConfirmation: false,
        reason: "mock policy check",
        confirmationToken: null,
      }),
    ),

  confirmPolicy: (action: string, token: string) =>
    gate(
      () =>
        client
          .postJson("/api/policy/confirm", { action, token })
          .then((r) => parseJsonOrThrow<PolicyConfirmResponse>(r)),
      async () => ({ ok: "true", action }),
    ),

  sendSessionChatMessage: (
    message: string,
    sessionId: string | null,
    init?: ApiRequestInit,
  ) =>
    gate(
      async () => {
        const body: {
          message: string;
          sessionId: string | null;
          policyConfirmationToken?: string;
        } = { message, sessionId: sessionId ?? null };
        if (init?.policyConfirmationToken) {
          body.policyConfirmationToken = init.policyConfirmationToken;
        }
        const res = await client.postJson("/api/chat/session-send", body, init);
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
      async () => {
        try {
          return await client.getJson<ChatSessionListResponse>("/api/chat/sessions");
        } catch {
          return { sessions: [] };
        }
      },
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

  sendChatMessage: (message: string, init?: ApiRequestInit) =>
    gate(
      async () => {
        const body: { message: string; policyConfirmationToken?: string } = { message };
        if (init?.policyConfirmationToken) {
          body.policyConfirmationToken = init.policyConfirmationToken;
        }
        const res = await client.postJson("/api/chat/send", body, init);
        return parseJsonOrThrow<ChatSendResponse>(res);
      },
      () => mocks.mockChatSend(message),
    ),

  sendWebChatMessage: (
    message: string,
    sessionId: string | null,
    init?: ApiRequestInit,
  ) =>
    gate(
      async () => {
        const body: {
          message: string;
          sessionId: string | null;
          policyConfirmationToken?: string;
        } = { message, sessionId: sessionId ?? null };
        if (init?.policyConfirmationToken) {
          body.policyConfirmationToken = init.policyConfirmationToken;
        }
        const res = await client.postJson("/api/chat/web-send", body, init);
        return parseJsonOrThrow<ChatWebSendResponse>(res);
      },
      async () => {
        const data = await mocks.mockChatSessionSend(message, sessionId);
        return { ...data, mode: "web-session" as const };
      },
    ),

  getCapabilities: async () => {
    const r = await fetchCapabilities();
    if (r.error && !r.data) throw new Error(r.error);
    return r.data ?? VERCEL_CLOUD_CAPABILITIES;
  },

  getMemoryActiveContext: () =>
    gate(
      () => client.getJson<ActiveContextResponse>("/api/memory/active-context"),
      async () => ({
        title: "",
        summary: "",
        keyPoints: [],
        recentWorkflowIds: [],
        recentRunIds: [],
        updatedAt: new Date().toISOString(),
      }),
    ),

  putMemoryActiveContext: (body: ActiveContextUpdateRequest) =>
    gate(
      () =>
        client
          .putJson("/api/memory/active-context", body)
          .then((r) => parseJsonOrThrow<ActiveContextResponse>(r)),
      async () => ({
        title: body.title ?? "",
        summary: body.summary ?? "",
        keyPoints: body.keyPoints ?? [],
        recentWorkflowIds: body.recentWorkflowIds ?? [],
        recentRunIds: body.recentRunIds ?? [],
        updatedAt: new Date().toISOString(),
      }),
    ),

  getMemorySummary: () =>
    gate(
      () => client.getJson<MemorySummaryResponse>("/api/memory/summary"),
      async () => ({
        title: "Mock memory",
        keyPoints: [],
        entryCount: 0,
        recentWorkflows: [],
        activeContext: null,
        generatedAt: new Date().toISOString(),
      }),
    ),

  listArtifacts: (params?: { runId?: string; workflowId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.runId) qs.set("run_id", params.runId);
    if (params?.workflowId) qs.set("workflow_id", params.workflowId);
    const suffix = qs.toString() ? `?${qs}` : "";
    return gate(
      () => client.getJson<ArtifactsListResponse>(`/api/artifacts${suffix}`),
      async () => ({ artifacts: [] }),
    );
  },

  getArtifact: (artifactId: string, preview = false) =>
    gate(
      () =>
        client.getJson<ArtifactRecordResponse>(
          `/api/artifacts/${encodeURIComponent(artifactId)}${preview ? "?preview=true" : ""}`,
        ),
      async () => ({
        id: artifactId,
        runId: null,
        workflowId: null,
        path: "output/mock.txt",
        kind: "output" as const,
        createdAt: new Date().toISOString(),
        summary: "mock",
      }),
    ),

  planOrchestration: (body: OrchestrationPlanRequest) =>
    gate(
      () => client.postJson("/api/orchestration/plan", body).then((r) => parseJsonOrThrow<WorkflowStateResponse>(r)),
      async () => ({
        workflowId: "mock-wf",
        task: body.task,
        mode: "fast" as const,
        playbookMode: "Chat",
        routingReason: "mock",
        status: "pending" as const,
        steps: [],
        runId: null,
        taskId: null,
        paused: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ),

  listTasks: (params?: { status?: string; dueBefore?: string; includeSnoozed?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.dueBefore) qs.set("due_before", params.dueBefore);
    if (params?.includeSnoozed) qs.set("include_snoozed", "true");
    const suffix = qs.toString() ? `?${qs}` : "";
    return gate(
      () => client.getJson<TasksListResponse>(`/api/tasks${suffix}`),
      async () => ({ tasks: [] }),
    );
  },

  createTask: (body: TaskCreateRequest, init?: ApiRequestInit) =>
    gate(
      () => {
        const payload = { ...body };
        if (init?.policyConfirmationToken) {
          payload.policyConfirmationToken = init.policyConfirmationToken;
        }
        return client.postJson("/api/tasks", payload).then((r) => parseJsonOrThrow<TaskResponse>(r));
      },
      async () => ({
        id: "mock-task",
        title: body.title,
        description: body.description ?? "",
        status: "pending" as const,
        priority: body.priority ?? null,
        dueAt: body.dueAt ?? null,
        snoozedUntil: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        workflowId: body.workflowId ?? null,
        runId: body.runId ?? null,
      }),
    ),

  getTask: (taskId: string) =>
    gate(
      () => client.getJson<TaskResponse>(`/api/tasks/${encodeURIComponent(taskId)}`),
      async () => ({
        id: taskId,
        title: "Mock task",
        description: "",
        status: "pending" as const,
        priority: null,
        dueAt: null,
        snoozedUntil: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        workflowId: null,
        runId: null,
      }),
    ),

  updateTask: (taskId: string, body: TaskUpdateRequest) =>
    gate(
      () =>
        client
          .patchJson(`/api/tasks/${encodeURIComponent(taskId)}`, body)
          .then((r) => parseJsonOrThrow<TaskResponse>(r)),
      async () => ({
        id: taskId,
        title: body.title ?? "Mock task",
        description: body.description ?? "",
        status: body.status ?? "pending",
        priority: body.priority ?? null,
        dueAt: body.dueAt ?? null,
        snoozedUntil: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        workflowId: null,
        runId: null,
      }),
    ),

  doneTask: (taskId: string, init?: ApiRequestInit) =>
    gate(
      () => {
        const body: { policyConfirmationToken?: string } = {};
        if (init?.policyConfirmationToken) {
          body.policyConfirmationToken = init.policyConfirmationToken;
        }
        return client
          .postJson(`/api/tasks/${encodeURIComponent(taskId)}/done`, body)
          .then((r) => parseJsonOrThrow<TaskResponse>(r));
      },
      async () => ({
        id: taskId,
        title: "Mock task",
        description: "",
        status: "done" as const,
        priority: null,
        dueAt: null,
        snoozedUntil: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        workflowId: null,
        runId: null,
      }),
    ),

  snoozeTask: (taskId: string, body: TaskSnoozeRequest, init?: ApiRequestInit) =>
    gate(
      () => {
        const payload = { ...body };
        if (init?.policyConfirmationToken) {
          payload.policyConfirmationToken = init.policyConfirmationToken;
        }
        return client
          .postJson(`/api/tasks/${encodeURIComponent(taskId)}/snooze`, payload)
          .then((r) => parseJsonOrThrow<TaskResponse>(r));
      },
      async () => ({
        id: taskId,
        title: "Mock task",
        description: "",
        status: "snoozed" as const,
        priority: null,
        dueAt: null,
        snoozedUntil: body.until ?? new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        workflowId: null,
        runId: null,
      }),
    ),

  deleteTask: (taskId: string, policyConfirmationToken?: string) => {
    const qs = policyConfirmationToken
      ? `?policy_confirmation_token=${encodeURIComponent(policyConfirmationToken)}`
      : "";
    return gate(
      () =>
        client
          .del(`/api/tasks/${encodeURIComponent(taskId)}${qs}`)
          .then((r) => parseJsonOrThrow<{ deleted: boolean; taskId: string }>(r)),
      async () => ({ deleted: true, taskId }),
    );
  },

  listOrchestrationWorkflows: () =>
    gate(
      () => client.getJson<OrchestrationListResponse>("/api/orchestration"),
      async () => ({ workflows: [] }),
    ),

  getOrchestrationWorkflow: (workflowId: string) =>
    gate(
      () =>
        client.getJson<WorkflowStateResponse>(
          `/api/orchestration/${encodeURIComponent(workflowId)}`,
        ),
      async () => ({
        workflowId,
        task: "",
        mode: "fast" as const,
        playbookMode: "Chat",
        routingReason: "",
        status: "pending" as const,
        steps: [],
        runId: null,
        taskId: null,
        paused: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ),

  executeOrchestrationStep: (workflowId: string, body: OrchestrationExecuteRequest = {}) =>
    gate(
      () =>
        client
          .postJson(`/api/orchestration/${encodeURIComponent(workflowId)}/execute`, body)
          .then((r) => parseJsonOrThrow<WorkflowStateResponse>(r)),
      async () => ({
        workflowId,
        task: "",
        mode: "fast" as const,
        playbookMode: "Chat",
        routingReason: "",
        status: "completed" as const,
        steps: [],
        runId: null,
        taskId: null,
        paused: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ),

  pauseOrchestration: (workflowId: string) =>
    gate(
      () =>
        client
          .postJson(`/api/orchestration/${encodeURIComponent(workflowId)}/pause`, {})
          .then((r) => parseJsonOrThrow<WorkflowStateResponse>(r)),
      async () => ({
        workflowId,
        task: "",
        mode: "fast" as const,
        playbookMode: "Chat",
        routingReason: "",
        status: "paused" as const,
        steps: [],
        runId: null,
        taskId: null,
        paused: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ),

  resumeOrchestration: (workflowId: string) =>
    gate(
      () =>
        client
          .postJson(`/api/orchestration/${encodeURIComponent(workflowId)}/resume`, {})
          .then((r) => parseJsonOrThrow<WorkflowStateResponse>(r)),
      async () => ({
        workflowId,
        task: "",
        mode: "fast" as const,
        playbookMode: "Chat",
        routingReason: "",
        status: "pending" as const,
        steps: [],
        runId: null,
        taskId: null,
        paused: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ),

  researchQuery: (body: ResearchQueryRequest, init?: ApiRequestInit) =>
    gate(
      () => {
        const payload = { ...body };
        if (init?.policyConfirmationToken) {
          payload.policyConfirmationToken = init.policyConfirmationToken;
        }
        return client
          .postJson("/api/research/query", payload, init)
          .then((r) => parseJsonOrThrow<ResearchResultResponse>(r));
      },
      async () => ({
        queryId: "mock-research-query",
        citations: [
          {
            url: "https://www.example.gov/report",
            title: "Example Gov Report",
            snippet: "Mock primary source.",
            fetchedAt: new Date().toISOString(),
            sourceTier: "primary" as const,
            verified: true,
          },
        ],
        summary: `Mock research summary for: ${body.query.slice(0, 80)}`,
        warnings: [],
        fallbackUsed: false,
        gatedSites: [],
      }),
    ),

  getResearchQuery: (queryId: string) =>
    gate(
      () =>
        client.getJson<ResearchResultResponse>(
          `/api/research/query/${encodeURIComponent(queryId)}`,
        ),
      async () => ({
        queryId,
        citations: [],
        summary: "Mock cached research result",
        warnings: [],
        fallbackUsed: false,
        gatedSites: [],
      }),
    ),

  browserAction: (body: BrowserActionRequest) =>
    gate(
      () =>
        client
          .postJson("/api/browser/action", body)
          .then((r) => parseJsonOrThrow<BrowserActionResultResponse>(r)),
      async () => ({
        actionId: "mock-browser-action",
        success: true,
        snapshotText: `Mock snapshot for ${body.action}`,
        screenshotPath:
          body.action === "screenshot" ? "output/browser-screenshots/mock.png" : null,
        error: null,
        durationMs: 12,
      }),
    ),

  getBrowserAction: (actionId: string) =>
    gate(
      () =>
        client.getJson<BrowserActionResultResponse>(
          `/api/browser/action/${encodeURIComponent(actionId)}`,
        ),
      async () => ({
        actionId,
        success: true,
        snapshotText: "Mock cached browser action",
        screenshotPath: null,
        error: null,
        durationMs: 5,
      }),
    ),

  listBrowserSessions: () =>
    gate(
      () => client.getJson<BrowserSessionsResponse>("/api/browser/sessions"),
      async () => ({
        sessions: [{ id: "default", name: "Default", userAgent: null }],
      }),
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
