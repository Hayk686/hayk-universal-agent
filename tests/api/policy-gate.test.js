"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyAction,
  isWhitelistedCommand,
} = require("../../api/_lib/policy-gate");
const {
  issueConfirmationToken,
  verifyConfirmationToken,
} = require("../../api/_lib/policy-confirm");
const { enforcePolicy } = require("../../api/_lib/policy-enforce");

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function mockJson() {
  return (_res, _status, _body) => {};
}

describe("policy-gate", () => {
  before(() => {
    process.env.POLICY_HMAC_SECRET = "test-secret";
  });

  after(() => {
    restoreEnv();
  });

  it("allows read actions", () => {
    const decision = classifyAction("read files list", { kind: "read" });
    assert.equal(decision.allowed, true);
    assert.equal(decision.risk, "read");
    assert.equal(decision.requiresConfirmation, false);
  });

  it("requires confirmation for AGENTS.md write", () => {
    const decision = classifyAction("write AGENTS.md", {
      kind: "write",
      path: "AGENTS.md",
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.requiresConfirmation, true);
    assert.equal(decision.risk, "write");
    assert.ok(decision.confirmationToken);
  });

  it("allows whitelisted hermes status", () => {
    const decision = classifyAction("exec hermes status", {
      kind: "exec",
      command: "hermes status",
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.risk, "exec");
    assert.equal(isWhitelistedCommand("hermes status"), true);
  });

  it("denies rm -rf /", () => {
    const decision = classifyAction("exec rm -rf /", {
      kind: "exec",
      command: "rm -rf /",
    });
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /hardline/);
  });

  it("requires confirmation for web-send network action", () => {
    const decision = classifyAction("network web-send", {
      kind: "network",
      endpoint: "/api/chat/web-send",
    });
    assert.equal(decision.requiresConfirmation, true);
    assert.equal(decision.risk, "network");
  });

  it("denies payment keywords", () => {
    const decision = classifyAction("payment stripe checkout", { kind: "payment" });
    assert.equal(decision.allowed, false);
    assert.equal(decision.risk, "payment");
  });

  it("denies command injection", () => {
    const decision = classifyAction("exec hermes status ; rm -rf /", {
      kind: "exec",
      command: "exec hermes status ; rm -rf /",
    });
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /injection/);
  });

  it("allows chat messages unless hardline", () => {
    const ok = classifyAction("exec chat message", {
      endpoint: "/api/chat/send",
      kind: "exec",
      command: "hello world",
      chat_message: true,
    });
    assert.equal(ok.allowed, true);

    const blocked = classifyAction("exec chat message", {
      endpoint: "/api/chat/send",
      kind: "exec",
      command: "rm -rf /",
      chat_message: true,
    });
    assert.equal(blocked.allowed, false);
  });
});

describe("policy-confirm", () => {
  before(() => {
    process.env.POLICY_HMAC_SECRET = "test-secret";
  });

  after(() => {
    restoreEnv();
  });

  it("issues and verifies valid token", () => {
    const action = "network web-send";
    const token = issueConfirmationToken(action, 120);
    const result = verifyConfirmationToken(token, action);
    assert.equal(result.ok, true);
  });

  it("rejects wrong action", () => {
    const token = issueConfirmationToken("network web-send");
    const result = verifyConfirmationToken(token, "browser analyze");
    assert.equal(result.ok, false);
    assert.match(result.reason, /signature/);
  });
});

describe("policy-enforce", () => {
  before(() => {
    process.env.POLICY_HMAC_SECRET = "test-secret";
  });

  after(() => {
    restoreEnv();
  });

  it("blocks web-send without token", () => {
    let statusCode = 0;
    let body = null;
    const res = {};
    const json = (_res, status, payload) => {
      statusCode = status;
      body = payload;
    };
    const gate = enforcePolicy({
      req: { headers: {} },
      res,
      json,
      action: "network web-send",
      context: { endpoint: "/api/chat/web-send", kind: "network" },
      confirmationToken: null,
    });
    assert.equal(gate.allowed, false);
    assert.equal(statusCode, 403);
    assert.equal(body.detail.policy.requiresConfirmation, true);
  });

  it("allows web-send with valid token", () => {
    const action = "network web-send";
    const token = issueConfirmationToken(action);
    const gate = enforcePolicy({
      req: { headers: {} },
      res: {},
      json: mockJson(),
      action,
      context: { endpoint: "/api/chat/web-send", kind: "network" },
      confirmationToken: token,
    });
    assert.equal(gate.allowed, true);
  });
});
