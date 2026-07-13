import assert from "node:assert/strict";
import test from "node:test";
import {
  outputHref,
  queuePrediction,
  runPrediction,
  waitForPrediction,
} from "../demo/appnz-client.mjs";

const reply = (body, ok = true, status = ok ? 200 : 500) => ({
  ok,
  status,
  json: async () => body,
});

test("runPrediction queues, polls, and returns a real output", async () => {
  const calls = [];
  const responses = [
    reply({ prediction: { id: "pred-1", status: "starting" } }, true, 201),
    reply({ prediction: { id: "pred-1", status: "processing", output: null } }),
    reply({
      prediction: {
        id: "pred-1",
        status: "succeeded",
        output: "https://cdn/result.png",
      },
    }),
  ];
  const statuses = [];
  const prediction = await runPrediction({
    baseUrl: "https://app.nz",
    modelId: "model-1",
    input: { image: "data:image/png;base64,AA==" },
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      return responses.shift();
    },
    sleepImpl: async () => {},
    onStatus: ({ status }) => statuses.push(status),
  });

  assert.equal(prediction.output, "https://cdn/result.png");
  assert.deepEqual(statuses, ["starting", "processing", "succeeded"]);
  assert.match(calls[0].url, /\/api\/cogs\/model-1\/predict$/);
  assert.equal(
    JSON.parse(calls[0].options.body).input.image,
    "data:image/png;base64,AA==",
  );
  assert.match(calls[2].url, /\/api\/cogs\/predictions\/pred-1$/);
});

test("queuePrediction surfaces structured API errors", async () => {
  await assert.rejects(
    queuePrediction({
      modelId: "model-1",
      input: {},
      fetchImpl: async () =>
        reply({ error: { message: "Sign in required" } }, false, 401),
    }),
    /Sign in required/,
  );
});

test("waitForPrediction surfaces terminal worker failures", async () => {
  await assert.rejects(
    waitForPrediction({
      predictionId: "pred-2",
      fetchImpl: async () =>
        reply({
          prediction: { id: "pred-2", status: "failed", error: "GPU OOM" },
        }),
      sleepImpl: async () => {},
    }),
    /GPU OOM/,
  );
});

test("waitForPrediction has a bounded timeout", async () => {
  await assert.rejects(
    waitForPrediction({
      predictionId: "pred-3",
      timeoutMs: 0,
      fetchImpl: async () =>
        reply({ prediction: { id: "pred-3", status: "starting" } }),
      sleepImpl: async () => {},
    }),
    /timed out/,
  );
});

test("outputHref accepts Cog file shapes", () => {
  assert.equal(
    outputHref("data:image/svg+xml;base64,AA=="),
    "data:image/svg+xml;base64,AA==",
  );
  assert.equal(
    outputHref([{ url: "https://cdn/model.glb" }]),
    "https://cdn/model.glb",
  );
  assert.equal(
    outputHref({ path: "/api/artifacts/one" }),
    "/api/artifacts/one",
  );
  assert.equal(outputHref(null), "");
});
