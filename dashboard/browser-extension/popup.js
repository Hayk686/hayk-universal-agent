const DEFAULT_API_BASE = "http://127.0.0.1:8080";
const POLICY_ACTION = "browser analyze";

const apiBaseEl = document.getElementById("apiBase");
const modeEl = document.getElementById("mode");
const analyzeEl = document.getElementById("analyze");
const copyEl = document.getElementById("copy");
const outputEl = document.getElementById("output");
const statusEl = document.getElementById("status");

let lastResponse = "";

function setBusy(isBusy, message) {
  analyzeEl.disabled = isBusy;
  statusEl.textContent = message;
}

function normalizeApiBase(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_API_BASE;
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(["apiBase", "mode"]);
  apiBaseEl.value = normalizeApiBase(stored.apiBase);
  modeEl.value = stored.mode || "workhorse";
}

async function saveSettings() {
  await chrome.storage.local.set({
    apiBase: normalizeApiBase(apiBaseEl.value),
    mode: modeEl.value,
  });
}

function collectPageContext() {
  const blockedTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "CANVAS"]);
  const chunks = [];
  const selection = String(window.getSelection?.() || "").trim();
  const walker = document.createTreeWalker(
    document.body || document.documentElement,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || blockedTags.has(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        const text = node.textContent.replace(/\s+/g, " ").trim();
        if (!text) {
          return NodeFilter.FILTER_REJECT;
        }
        const style = window.getComputedStyle(parent);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  while (walker.nextNode()) {
    const text = walker.currentNode.textContent.replace(/\s+/g, " ").trim();
    if (text) {
      chunks.push(text);
    }
    if (chunks.join("\n").length > 16000) {
      break;
    }
  }

  return {
    url: location.href,
    title: document.title || "",
    selection,
    visibleText: chunks.join("\n").slice(0, 16000),
  };
}

async function getActiveTabContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("Не нашёл активную вкладку.");
  }
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: collectPageContext,
  });
  if (!result?.result?.visibleText) {
    throw new Error("Не удалось прочитать видимый текст страницы.");
  }
  return result.result;
}

/**
 * PolicyGate-aware fetch helper. The dashboard backend requires a confirmation
 * token for browser analyses; the first attempt always returns 403 with the
 * token. We retry once with ``policyConfirmationToken`` and propagate any
 * second failure to the caller.
 */
async function policyAwarePost(apiBase, path, body) {
  let response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 403) {
    let detail;
    try {
      detail = await response.clone().json();
    } catch {
      detail = null;
    }
    const policy = detail?.detail?.policy;
    const token = policy?.confirmationToken;
    if (token) {
      statusEl.textContent = "Подтверждаю действие…";
      response = await fetch(`${apiBase}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, policyConfirmationToken: token }),
      });
    } else if (detail?.detail) {
      const msg =
        typeof detail.detail === "string" ? detail.detail : JSON.stringify(detail.detail);
      throw new Error(`Policy gate: ${msg}`);
    }
  }

  return response;
}

async function analyzePage() {
  await saveSettings();
  const apiBase = normalizeApiBase(apiBaseEl.value);
  setBusy(true, "Читаю страницу...");
  outputEl.textContent = "Собираю видимый текст текущей вкладки...";
  copyEl.disabled = true;
  lastResponse = "";

  try {
    const context = await getActiveTabContext();
    setBusy(true, "Отправляю агенту...");
    outputEl.textContent = "Агент думает...";
    const response = await policyAwarePost(apiBase, "/api/browser/analyze", {
      ...context,
      mode: modeEl.value,
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const reason =
        (payload && (payload.detail?.detail || payload.detail)) ||
        `API вернул HTTP ${response.status}`;
      throw new Error(typeof reason === "string" ? reason : JSON.stringify(reason));
    }
    lastResponse = payload.response || "";
    outputEl.textContent = lastResponse || "(пустой ответ)";
    copyEl.disabled = !lastResponse;
    statusEl.textContent = `${payload.model || modeEl.value} · ${payload.durationMs || 0} ms`;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("Failed to fetch") || msg.toLowerCase().includes("network")) {
      outputEl.textContent =
        `Не подключиться к ${apiBase}. Проверь, что FastAPI запущен ` +
        "(uvicorn app.main:app --host 0.0.0.0 --port 8080) и URL выше корректный.";
    } else {
      outputEl.textContent = msg;
    }
    statusEl.textContent = "Ошибка";
  } finally {
    analyzeEl.disabled = false;
  }
}

async function copyResponse() {
  if (!lastResponse) {
    return;
  }
  await navigator.clipboard.writeText(lastResponse);
  statusEl.textContent = "Скопировано";
}

apiBaseEl.addEventListener("change", saveSettings);
modeEl.addEventListener("change", saveSettings);
analyzeEl.addEventListener("click", analyzePage);
copyEl.addEventListener("click", copyResponse);

void POLICY_ACTION; // reserved for future "policy/check" preflight

loadSettings().catch((error) => {
  outputEl.textContent = error instanceof Error ? error.message : String(error);
});
