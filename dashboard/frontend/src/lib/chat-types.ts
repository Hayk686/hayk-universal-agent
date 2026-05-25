export type ChatMode = "fast" | "web" | "session";

export type TurnMode =
  | "hermes-session"
  | "oneshot"
  | "web-oneshot"
  | "web-session"
  | ChatMode;

export type HistoryMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  exitCode?: number;
  durationMs?: number;
  mode?: TurnMode;
  timestamp?: number;
};
