import type { CapabilitiesResponse } from "@/types/api-contract";
import { apiBase, useMocks } from "@/lib/api/client";

/** Kernel panels need memory, orchestration, tasks — not available on Vercel cloud API alone. */
export function isKernelBackendAvailable(caps: CapabilitiesResponse | null): boolean {
  if (!caps) return false;
  return Boolean(
    caps.memoryIndex &&
      caps.artifactsIndex &&
      caps.orchestrator &&
      caps.dailyTasks,
  );
}

export type KernelBackendMode = "mock" | "pc" | "vercel-cloud" | "unknown";

export function kernelBackendMode(caps: CapabilitiesResponse | null): KernelBackendMode {
  if (useMocks()) return "mock";
  if (isKernelBackendAvailable(caps)) return "pc";
  if (caps?.policyGate && !caps.memoryIndex) return "vercel-cloud";
  return "unknown";
}

export function workspaceUnavailableTitle(mode: KernelBackendMode): string {
  switch (mode) {
    case "vercel-cloud":
      return "Workspace требует FastAPI на вашем ПК";
    case "unknown":
      return "Полный backend недоступен";
    default:
      return "Workspace недоступен";
  }
}

export function workspaceUnavailableMessage(mode: KernelBackendMode): string {
  const base = apiBase();
  if (mode === "vercel-cloud" || (!base && mode === "unknown")) {
    return (
      "Панели Memory, Tasks, Research, Browser и Workflows работают только через FastAPI + Hermes на вашем компьютере. " +
      "Vercel cloud API поддерживает chat и policy, но не kernel-функции."
    );
  }
  if (base) {
    return (
      `UI настроен на ${base}, но kernel-capabilities выключены. ` +
      "Проверьте, что FastAPI запущен на :8080, Hermes в PATH, и ответ /api/capabilities содержит memoryIndex: true."
    );
  }
  return "Запустите FastAPI на порту 8080 или задайте VITE_API_BASE_URL на HTTPS-туннель вашего ПК.";
}

export const WORKSPACE_SETUP_STEPS: string[] = [
  "На ПК: cd dashboard/backend → uvicorn app.main:app --host 0.0.0.0 --port 8080",
  "HTTPS-туннель к :8080 (ngrok, Cloudflare Tunnel, Tailscale Funnel)",
  "Вариант A: вставить URL туннеля выше и нажать Connect (без redeploy)",
  "Вариант B: Vercel → BACKEND_URL=https://туннель (runtime, без /api) + кнопка Use Vercel proxy",
  "Вариант C: VITE_API_BASE_URL + Redeploy (зашивается при сборке)",
  "На ПК: CORS_ORIGINS=https://ваш-app.vercel.app в backend/.env",
];

export function formatKernelApiError(message: string, apiPath?: string): string {
  const pathHint = apiPath ? ` (${apiPath})` : "";
  if (/NOT_FOUND|not found|404/i.test(message) && /page could not be found/i.test(message)) {
    if (!apiBase()) {
      return (
        `API не найден${pathHint}. На Vercel cloud нет kernel-маршрутов. ` +
        "Задайте VITE_API_BASE_URL на HTTPS-туннель FastAPI на ПК и сделайте redeploy."
      );
    }
  }
  if (/NOT_FOUND|not found/i.test(message) && !apiBase()) {
    return (
      `API не найден${pathHint}. Задайте VITE_API_BASE_URL на FastAPI (ПК) или запустите backend локально на :8080.`
    );
  }
  if (message.includes("HTML instead of JSON")) {
    return (
      "Сервер вернул HTML вместо JSON. Укажите VITE_API_BASE_URL на FastAPI или включите VITE_USE_MOCKS=true."
    );
  }
  if (message.length > 280) return `${message.slice(0, 280)}…`;
  return message;
}
