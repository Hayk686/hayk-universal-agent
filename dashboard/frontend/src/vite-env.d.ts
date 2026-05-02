/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Fallback if VITE_API_BASE_URL is unset. */
  readonly VITE_API_BASE?: string;
  /** Preferred API origin (scheme + host + port, no trailing slash). */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_USE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
