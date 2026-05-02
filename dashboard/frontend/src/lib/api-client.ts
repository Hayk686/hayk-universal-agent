/**
 * Re-exports `api` for legacy imports (`apiClient`).
 * Prefer `import { api } from "@/lib/api"` or `"../lib/api"`.
 */

export {
  api,
  apiClient,
  downloadUrl,
  parseJsonOrThrow,
  commandRunFromResponse,
  saveMarkdownFromResponse,
  okFromResponse,
} from "./api";
