#!/usr/bin/env bash
# Bootstrap live workspace on Raspberry Pi from this repository.
# Run ON the Pi after cloning. Adjust variables as needed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE_WS="${LIVE_WS:-/home/ubuntu/ai-office-agent-workspace}"
OWNER="${OWNER:-ubuntu}"

echo "Repo:       ${REPO_ROOT}"
echo "Live workspace: ${LIVE_WS}"

sudo mkdir -p "${LIVE_WS}"/{input,output,reports,playbooks,examples}
sudo chown -R "${OWNER}:${OWNER}" "${LIVE_WS}"

rsync -av "${REPO_ROOT}/agent-workspace/AGENTS.md" "${LIVE_WS}/"
rsync -av "${REPO_ROOT}/agent-workspace/playbooks/" "${LIVE_WS}/playbooks/"
rsync -av "${REPO_ROOT}/agent-workspace/examples/" "${LIVE_WS}/examples/" || true

echo "Done. Next: install and configure Hermes; point it at ${LIVE_WS}"
