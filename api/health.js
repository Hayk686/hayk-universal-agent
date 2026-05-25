"use strict";

const { proxyRequest } = require("./_proxy-backend");
const { cors, json } = require("./_openrouter");
const { backendOrigin } = require("./_proxy-backend");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  if (backendOrigin()) {
    return proxyRequest(req, res, [], { rootHealth: true });
  }
  return json(res, 200, { status: "ok" });
};
