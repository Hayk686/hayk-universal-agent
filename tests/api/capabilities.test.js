"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const pcHandler = require("../../api/pc/[...path]");
const { backendOrigin } = require("../../api/_proxy-backend");

const ORIGINAL_BACKEND = process.env.BACKEND_URL;

before(() => {
  delete process.env.BACKEND_URL;
});

after(() => {
  if (ORIGINAL_BACKEND === undefined) delete process.env.BACKEND_URL;
  else process.env.BACKEND_URL = ORIGINAL_BACKEND;
});

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
    end(payload) {
      this.body = payload;
    },
  };
}

test("GET /api/pc/capabilities returns 503 when BACKEND_URL unset", async () => {
  const res = mockRes();
  await pcHandler(
    { method: "GET", url: "https://local/api/pc/capabilities", headers: {} },
    res,
  );
  assert.equal(res.statusCode, 503);
  const body = JSON.parse(String(res.body));
  assert.match(body.detail, /BACKEND_URL/i);
});

test("backendOrigin is empty without env", () => {
  assert.equal(backendOrigin(), "");
});
