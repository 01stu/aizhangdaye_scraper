export const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class HttpError extends Error {
  constructor(message, status, retryAfterMs = 0) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export class RequestTimeoutError extends Error {
  constructor(url, timeoutMs, attempt) {
    super(`请求超时（${timeoutMs}ms）：${url}（第 ${attempt + 1} 次尝试）`);
    this.name = "RequestTimeoutError";
    this.code = "ETIMEDOUT";
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.attempt = attempt;
    this.status = 408;
    this.retryAfterMs = 0;
  }
}

function retryAfter(response) {
  const value = response.headers.get("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? Math.max(0, seconds * 1_000)
    : Math.max(0, Date.parse(value) - Date.now()) || 0;
}

export function createHttpClient({ timeoutMs, retryCount, delayMs = 0, fetchImpl = fetch, wait = sleep }) {
  const nextRequestAt = new Map();
  const queues = new Map();

  async function pace(url) {
    if (!delayMs) return;
    const origin = new URL(url).origin;
    const previous = queues.get(origin) || Promise.resolve();
    const queued = previous.catch(() => {}).then(async () => {
      await wait(Math.max(0, (nextRequestAt.get(origin) || 0) - Date.now()));
      nextRequestAt.set(origin, Date.now() + delayMs);
    });
    queues.set(origin, queued);
    await queued;
  }

  async function request(url, options = {}, { retry = true, paced = true } = {}) {
    for (let attempt = 0; ; attempt++) {
      if (paced) await pace(url);
      try {
        const response = await fetchImpl(url, {
          ...options,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          const preview = (await response.text()).slice(0, 120);
          throw new HttpError(`HTTP ${response.status}: ${preview}`, response.status, retryAfter(response));
        }
        return response;
      } catch (error) {
        const normalizedError =
          error?.name === "TimeoutError" || error?.name === "AbortError"
            ? new RequestTimeoutError(url, timeoutMs, attempt)
            : error;
        const canRetry =
          retry && attempt < retryCount &&
          (normalizedError instanceof RequestTimeoutError ||
            !(normalizedError instanceof HttpError) ||
            normalizedError.status === 429 ||
            normalizedError.status >= 500);
        if (!canRetry) throw normalizedError;
        const delay = Math.min(
          30_000,
          Math.max(normalizedError.retryAfterMs || 0, 500 * 2 ** attempt),
        );
        await wait(delay + Math.floor(Math.random() * 250));
      }
    }
  }

  async function json(url, options, settings) {
    const response = await request(url, options, settings);
    try {
      return await response.json();
    } catch {
      throw new Error(`${url} returned invalid JSON`);
    }
  }

  return { request, json };
}
