#!/usr/bin/env bash
# Create a timestamped tarball of the live workspace (default Pi path).
# Excludes heavy .venv by default; set INCLUDE_VENV=1 to include it.

set -euo pipefail

SRC="${SRC:-/home/ubuntu/ai-office-agent-workspace}"
DEST_DIR="${DEST_DIR:-${HOME}/hayk-backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="${DEST_DIR}/workspace-${STAMP}.tar.gz"

mkdir -p "${DEST_DIR}"

if [[ "${INCLUDE_VENV:-0}" == "1" ]]; then
  tar -czf "${OUT}" -C "$(dirname "${SRC}")" "$(basename "${SRC}")"
else
  tar -czf "${OUT}" \
    --exclude='.venv' \
    -C "$(dirname "${SRC}")" \
    "$(basename "${SRC}")"
fi

echo "Backup written: ${OUT}"
ls -lh "${OUT}"
