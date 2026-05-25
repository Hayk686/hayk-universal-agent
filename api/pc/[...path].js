"use strict";

const { proxyRequest } = require("../_proxy-backend");

module.exports = async function handler(req, res) {
  const url = new URL(req.url || "/", "https://local.invalid");
  const segments = url.pathname.replace(/^\/api\/pc\/?/, "").split("/").filter(Boolean);
  return proxyRequest(req, res, segments);
};
