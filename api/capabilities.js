const { cors, json } = require("./_openrouter");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    return json(res, 405, { detail: "Method not allowed" });
  }

  return json(res, 200, {
    policyGate: true,
    observability: true,
    memoryIndex: false,
    artifactsIndex: false,
    contextRouter: false,
    toolExecutor: false,
    researchPipeline: false,
    browserDriver: false,
    dailyTasks: false,
    orchestrator: false,
  });
};
