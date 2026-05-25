import type { PolicyDecisionResponse } from "@/types/api-contract";

export type PolicyChallenge = {
  action: string;
  decision: PolicyDecisionResponse;
  confirmError?: string;
};

export class PolicyConfirmationRequiredError extends Error {
  readonly challenge: PolicyChallenge;

  constructor(challenge: PolicyChallenge) {
    super(challenge.decision.reason || "Policy confirmation required");
    this.name = "PolicyConfirmationRequiredError";
    this.challenge = challenge;
  }
}

export class PolicyConfirmationCancelledError extends Error {
  constructor() {
    super("Policy confirmation cancelled");
    this.name = "PolicyConfirmationCancelledError";
  }
}

function parsePolicyDetail(raw: unknown): PolicyChallenge | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const policy = obj.policy;
  if (!policy || typeof policy !== "object") return null;
  const decision = policy as PolicyDecisionResponse;
  if (!decision.requiresConfirmation) return null;
  const action = typeof obj.action === "string" ? obj.action : "";
  const confirmError = typeof obj.confirmError === "string" ? obj.confirmError : undefined;
  return { action, decision, confirmError };
}

/** Parse FastAPI 403 body text for a policy confirmation challenge. */
export function extractPolicyChallengeFromText(text: string): PolicyChallenge | null {
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    const detail = parsed.detail;
    if (typeof detail === "string") return null;
    return parsePolicyDetail(detail);
  } catch {
    return null;
  }
}

export function extractPolicyChallengeFromError(error: unknown): PolicyChallenge | null {
  if (error instanceof PolicyConfirmationRequiredError) {
    return error.challenge;
  }
  if (error instanceof Error) {
    return extractPolicyChallengeFromText(error.message);
  }
  if (typeof error === "string") {
    return extractPolicyChallengeFromText(error);
  }
  return null;
}
