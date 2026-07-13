const FAILED = new Set(["failed", "canceled", "cancelled"]);

function headers(token, json = false) {
  const value = {};
  if (json) value["content-type"] = "application/json";
  if (token) value.authorization = `Bearer ${token}`;
  return value;
}

async function decode(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      body.error?.message ||
        body.error ||
        `app.nz returned HTTP ${response.status}`,
    );
  }
  return body;
}

export async function queuePrediction({
  modelId,
  input,
  baseUrl = "https://app.nz",
  token = "",
  fetchImpl = fetch,
}) {
  if (!modelId) throw new Error("A Cog model id is required.");
  const response = await fetchImpl(
    `${baseUrl}/api/cogs/${encodeURIComponent(modelId)}/predict`,
    {
      method: "POST",
      credentials: "include",
      headers: headers(token, true),
      body: JSON.stringify({ input }),
    },
  );
  const body = await decode(response);
  const prediction = body.prediction;
  if (!prediction?.id)
    throw new Error("app.nz did not return a prediction id.");
  return prediction;
}

export async function waitForPrediction({
  predictionId,
  baseUrl = "https://app.nz",
  token = "",
  fetchImpl = fetch,
  intervalMs = 2000,
  timeoutMs = 15 * 60 * 1000,
  onStatus = () => {},
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!predictionId) throw new Error("A prediction id is required.");
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const response = await fetchImpl(
      `${baseUrl}/api/cogs/predictions/${encodeURIComponent(predictionId)}`,
      { credentials: "include", headers: headers(token) },
    );
    const body = await decode(response);
    const prediction = body.prediction;
    if (!prediction?.status)
      throw new Error("app.nz returned an invalid prediction.");
    onStatus(prediction);

    if (prediction.status === "succeeded") {
      if (
        prediction.output === null ||
        prediction.output === undefined ||
        prediction.output === ""
      ) {
        throw new Error("Prediction succeeded without an output.");
      }
      return prediction;
    }
    if (FAILED.has(prediction.status)) {
      throw new Error(prediction.error || `Prediction ${prediction.status}.`);
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Prediction timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
      );
    }
    await sleepImpl(intervalMs);
  }
}

export async function runPrediction(options) {
  const queued = await queuePrediction(options);
  options.onStatus?.(queued);
  if (queued.status === "succeeded") return queued;
  return waitForPrediction({ ...options, predictionId: queued.id });
}

export function outputHref(output) {
  if (typeof output === "string" && output) return output;
  if (Array.isArray(output) && output.length) return outputHref(output[0]);
  if (output && typeof output === "object") {
    return output.url || output.href || output.path || "";
  }
  return "";
}
