import { useCallback, useRef, useState } from "react";
import { PolicyConfirmModal } from "@/components/policy/PolicyConfirmModal";
import { api } from "@/lib/api";
import {
  PolicyConfirmationCancelledError,
  PolicyConfirmationRequiredError,
  extractPolicyChallengeFromError,
  type PolicyChallenge,
} from "@/lib/policy/errors";

type PendingRequest<T> = {
  execute: (confirmationToken?: string) => Promise<T>;
  challenge: PolicyChallenge;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

async function resolveConfirmationToken(challenge: PolicyChallenge): Promise<string> {
  const existing = challenge.decision.confirmationToken;
  if (existing) return existing;

  const checked = await api.checkPolicy({ action: challenge.action });
  if (!checked.confirmationToken) {
    throw new Error("Policy check did not return a confirmation token");
  }
  return checked.confirmationToken;
}

export function usePolicyConfirmation() {
  const [pending, setPending] = useState<PendingRequest<unknown> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const pendingRef = useRef<PendingRequest<unknown> | null>(null);

  const clearPending = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
    setConfirming(false);
  }, []);

  const requestWithConfirmation = useCallback(
    async <T,>(execute: (confirmationToken?: string) => Promise<T>): Promise<T> => {
      try {
        return await execute();
      } catch (error) {
        const challenge = extractPolicyChallengeFromError(error);
        if (!challenge) throw error;

        return new Promise<T>((resolve, reject) => {
          const entry: PendingRequest<T> = {
            execute,
            challenge,
            resolve,
            reject,
          };
          pendingRef.current = entry as PendingRequest<unknown>;
          setPending(entry as PendingRequest<unknown>);
        });
      }
    },
    [],
  );

  const handleConfirm = useCallback(async () => {
    const current = pendingRef.current;
    if (!current || confirming) return;

    setConfirming(true);
    try {
      const token = await resolveConfirmationToken(current.challenge);
      await api.confirmPolicy(current.challenge.action, token);
      const result = await current.execute(token);
      current.resolve(result);
      clearPending();
    } catch (error) {
      const retryChallenge = extractPolicyChallengeFromError(error);
      if (retryChallenge) {
        const next: PendingRequest<unknown> = {
          ...current,
          challenge: {
            ...retryChallenge,
            confirmError:
              retryChallenge.confirmError ??
              (error instanceof Error ? error.message : String(error)),
          },
        };
        pendingRef.current = next;
        setPending(next);
        setConfirming(false);
        return;
      }
      current.reject(error instanceof Error ? error : new Error(String(error)));
      clearPending();
    }
  }, [clearPending, confirming]);

  const handleCancel = useCallback(() => {
    const current = pendingRef.current;
    if (current) {
      current.reject(new PolicyConfirmationCancelledError());
    }
    clearPending();
  }, [clearPending]);

  const policyConfirmModal = (
    <PolicyConfirmModal
      open={pending !== null}
      challenge={pending?.challenge ?? null}
      confirming={confirming}
      onConfirm={() => void handleConfirm()}
      onCancel={handleCancel}
    />
  );

  return {
    requestWithConfirmation,
    policyConfirmModal,
    policyConfirmationPending: pending !== null,
  };
}

export { PolicyConfirmationRequiredError, PolicyConfirmationCancelledError };
