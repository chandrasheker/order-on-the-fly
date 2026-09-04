const BACKOFF_MS = [2000, 5000, 10000, 20000, 30000];

export function nextBackoff(previous = 0) {
  const index = BACKOFF_MS.findIndex((value) => value > previous);
  return BACKOFF_MS[index === -1 ? BACKOFF_MS.length - 1 : index];
}

export function assertServerUrl(url, nodeEnv = process.env.NODE_ENV) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("TABLETAP_SERVER_URL is invalid");
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (nodeEnv === "production" && parsed.protocol !== "https:" && !local) {
    throw new Error("Production printer agent requires HTTPS");
  }
  return parsed.toString().replace(/\/$/, "");
}

export async function claimJob(params) {
  const res = await fetch(`${params.serverUrl}/api/print/agent/claim`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ version: params.version ?? "0.1.0" }),
    signal: AbortSignal.timeout(params.timeoutMs ?? 15_000),
  });
  if (!res.ok) {
    const error = new Error(`claim failed ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function reportResult(params) {
  const res = await fetch(`${params.serverUrl}/api/print/agent/result`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jobId: params.jobId,
      claimToken: params.claimToken,
      outcome: params.outcome,
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
    }),
    signal: AbortSignal.timeout(params.timeoutMs ?? 15_000),
  });
  if (!res.ok) {
    const error = new Error(`result failed ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export function redactLogs(args) {
  return args.map((arg) => {
    if (typeof arg !== "string") return arg;
    return arg.replace(/tt_pa_[A-Za-z0-9_]+/g, "tt_pa_[redacted]");
  });
}
