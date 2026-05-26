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

export type OrchestratorMode = "fast" | "web" | "session";

export type ChatSendResponse = {
  response: string;
  exitCode: number;
  durationMs: number;
  mode: "oneshot";
  orchestratorMode?: OrchestratorMode;
};

export type ChatWebSendResponse = {
  response: string;
  sessionId: string | null;
  exitCode: number;
  durationMs: number;
  mode: "web-session";
  orchestratorMode?: OrchestratorMode;
  researchQueryId?: string | null;
  parseWarning?: string | null;
};

export type ChatSessionSendResponse = {
  response: string;
  sessionId: string | null;
  exitCode: number;
  durationMs: number;
  mode: "hermes-session";
  orchestratorMode?: OrchestratorMode;
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
/**
 * Static identifiers for the small subset of commands that are referenced
 * from frontend code (buttons, quick actions). The authoritative whitelist
 * lives on the backend at ``GET /api/commands/whitelist`` and may contain
 * workspace-relative paths that this constant cannot know.
 */
export const WHITELIST_SHELL_COMMANDS = {
  hermesStatus: "hermes status",
  hermesDoctor: "hermes doctor",
  hermesPing: 'hermes -z "Say exactly: OK"',
  hermesLogsSince: "hermes logs --since 1h",
  hermesLogsErrors: "hermes logs errors",
  pwd: "pwd",
} as const;

/** Heuristic category for a whitelisted shell command (UI grouping only). */
export type WhitelistCommandCategory =
  | "hermes"
  | "logs"
  | "filesystem"
  | "python"
  | "shell";

export function categorizeWhitelistCommand(command: string): WhitelistCommandCategory {
  const c = command.trim();
  if (c.startsWith("hermes logs")) return "logs";
  if (c.startsWith("hermes ")) return "hermes";
  if (c.startsWith("ls ") || c.startsWith("Get-ChildItem") || c === "pwd") return "filesystem";
  if (c.includes("python") || c.endsWith("python.exe")) return "python";
  return "shell";
}

export type PolicyDecisionResponse = {
  allowed: boolean;
  risk: "read" | "write" | "exec" | "network" | "browser" | "payment";
  requiresConfirmation: boolean;
  reason: string;
  confirmationToken: string | null;
};

export type PolicyHttpDetail = {
  detail: string;
  policy: PolicyDecisionResponse;
  action: string;
  confirmError?: string;
};

export type PolicyCheckRequest = {
  action: string;
  context?: Record<string, unknown>;
};

export type PolicyConfirmRequest = {
  action: string;
  token: string;
};

export type PolicyConfirmResponse = {
  ok: string;
  action: string;
};

export type CapabilitiesResponse = {
  policyGate: boolean;
  observability: boolean;
  memoryIndex: boolean;
  artifactsIndex: boolean;
  contextRouter: boolean;
  toolExecutor: boolean;
  researchPipeline: boolean;
  browserDriver: boolean;
  dailyTasks: boolean;
  orchestrator: boolean;
};

export type ActiveContextResponse = {
  title: string;
  summary: string;
  keyPoints: string[];
  recentWorkflowIds: string[];
  recentRunIds: string[];
  updatedAt: string;
};

export type ActiveContextUpdateRequest = {
  title?: string;
  summary?: string;
  keyPoints?: string[];
  recentWorkflowIds?: string[];
  recentRunIds?: string[];
  policyConfirmationToken?: string | null;
};

export type MemorySummaryResponse = {
  title: string;
  keyPoints: string[];
  entryCount: number;
  recentWorkflows: Array<{
    workflowId: string;
    task: string;
    mode: OrchestratorMode;
    status: WorkflowStepStatus;
    runId: string | null;
    updatedAt: string;
  }>;
  activeContext: ActiveContextResponse | null;
  generatedAt: string;
};

export type ArtifactKind = "report" | "output" | "input" | "log" | "workflow";

export type ArtifactRecordResponse = {
  id: string;
  runId: string | null;
  workflowId: string | null;
  path: string;
  kind: ArtifactKind;
  createdAt: string;
  summary: string;
  contentPreview?: string;
};

export type ArtifactsListResponse = {
  artifacts: ArtifactRecordResponse[];
};

export type TaskStatus = "pending" | "in_progress" | "done" | "snoozed" | "cancelled";

export type TaskPriority = "low" | "normal" | "high";

export type TaskResponse = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority | null;
  dueAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  workflowId: string | null;
  runId: string | null;
};

export type TasksListResponse = {
  tasks: TaskResponse[];
};

export type TaskCreateRequest = {
  title: string;
  description?: string;
  priority?: TaskPriority | null;
  dueAt?: string | null;
  workflowId?: string | null;
  runId?: string | null;
  policyConfirmationToken?: string | null;
};

export type TaskUpdateRequest = {
  title?: string | null;
  description?: string | null;
  status?: TaskStatus | null;
  priority?: TaskPriority | null;
  dueAt?: string | null;
};

export type TaskSnoozeRequest = {
  until?: string | null;
  minutes?: number | null;
  policyConfirmationToken?: string | null;
};

export type WorkflowStepStatus = "pending" | "running" | "paused" | "completed" | "failed";

export type WorkflowStepResponse = {
  id: string;
  title: string;
  action: string;
  status: WorkflowStepStatus;
  mode: OrchestratorMode;
  result: string | null;
  error: string | null;
  policyReason: string | null;
};

export type WorkflowStateResponse = {
  workflowId: string;
  task: string;
  mode: OrchestratorMode;
  playbookMode: string;
  routingReason: string;
  status: WorkflowStepStatus;
  steps: WorkflowStepResponse[];
  runId: string | null;
  taskId: string | null;
  researchQueryId?: string | null;
  browserPreflightRequired?: boolean;
  browserActionId?: string | null;
  paused: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrchestrationPlanRequest = {
  task: string;
  createTask?: boolean;
};

export type OrchestrationExecuteRequest = {
  stepId?: string | null;
  policyConfirmationToken?: string | null;
};

export type OrchestrationListResponse = {
  workflows: WorkflowStateResponse[];
};

export type SourceTier = "primary" | "secondary" | "unknown";

export type GatedReason = "paywall" | "login" | "captcha" | "blocked";

export type CitationResponse = {
  url: string;
  title: string;
  snippet: string;
  fetchedAt: string;
  sourceTier: SourceTier;
  verified: boolean;
};

export type GatedSiteInfoResponse = {
  domain: string;
  reason: GatedReason;
};

export type ResearchQueryRequest = {
  query: string;
  maxResults?: number;
  timeoutSeconds?: number;
  requireVerification?: boolean;
  policyConfirmationToken?: string | null;
};

export type ResearchResultResponse = {
  queryId: string;
  citations: CitationResponse[];
  summary: string;
  warnings: string[];
  fallbackUsed: boolean;
  gatedSites: GatedSiteInfoResponse[];
};

export type BrowserActionType =
  | "navigate"
  | "click"
  | "fill"
  | "snapshot"
  | "screenshot";

export type BrowserActionRequest = {
  action: BrowserActionType;
  url?: string | null;
  selector?: string | null;
  value?: string | null;
  sessionProfile?: string | null;
  timeoutSeconds?: number;
  workflowId?: string | null;
  policyConfirmationToken?: string | null;
};

export type BrowserActionResultResponse = {
  actionId: string;
  success: boolean;
  snapshotText: string | null;
  screenshotPath: string | null;
  error: string | null;
  durationMs: number;
};

export type BrowserSessionProfileResponse = {
  id: string;
  name: string;
  userAgent: string | null;
};

export type BrowserSessionsResponse = {
  sessions: BrowserSessionProfileResponse[];
};
