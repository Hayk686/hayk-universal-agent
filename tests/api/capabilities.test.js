const { test } = require("node:test");
const assert = require("node:assert/strict");

const handler = require("../../api/capabilities");

function mockRes() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
    },
    end() {},
  };
}

test("GET /api/capabilities returns expected shape", async () => {
  const res = mockRes();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.policyGate, true);
  assert.equal(res.body.observability, true);
  assert.equal(typeof res.body.memoryIndex, "boolean");
  assert.equal(typeof res.body.orchestrator, "boolean");
  assert.equal(typeof res.body.dailyTasks, "boolean");
});

test("OPTIONS returns 204 with CORS", async () => {
  const res = mockRes();
  await handler({ method: "OPTIONS" }, res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
});
