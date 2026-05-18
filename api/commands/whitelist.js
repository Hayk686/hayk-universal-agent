const { cors, json } = require("../_openrouter");

const commands = [
  "hermes status",
  "hermes doctor",
  'hermes -z "Say exactly: OK"',
];

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    return json(res, 405, { detail: "Method not allowed" });
  }
  return json(res, 200, { commands });
};
