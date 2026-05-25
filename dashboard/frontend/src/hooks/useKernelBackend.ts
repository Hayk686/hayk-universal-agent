import { useCallback, useEffect, useState } from "react";
import { fetchCapabilities } from "@/lib/api";
import {
  isKernelBackendAvailable,
  kernelBackendMode,
  type KernelBackendMode,
} from "@/lib/kernel-backend";
import type { CapabilitiesResponse } from "@/types/api-contract";

export function useKernelBackend() {
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  const [mode, setMode] = useState<KernelBackendMode>("unknown");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchCapabilities();
    setCapabilities(result.data);
    setError(result.error ?? null);
    const ok = isKernelBackendAvailable(result.data);
    setAvailable(ok);
    setMode(kernelBackendMode(result.data));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { capabilities, loading, error, available, mode, reload: load };
}
