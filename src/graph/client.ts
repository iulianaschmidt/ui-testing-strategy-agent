import type { TokenProvider } from "../auth/token-provider.js";
import type { GraphCollection } from "./types.js";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

export class GraphRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
    readonly responseBody?: string,
  ) {
    super(message);
    this.name = "GraphRequestError";
  }
}

export interface GraphRequestOptions {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
  responseType?: "json" | "buffer" | "none";
}

export class GraphClient {
  constructor(
    private readonly tokenProvider: TokenProvider,
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly maxAttempts = 4,
  ) {}

  async request<T>(pathOrUrl: string, options: GraphRequestOptions = {}): Promise<T> {
    const response = await this.send(pathOrUrl, options);
    if (options.responseType === "none" || response.status === 204) return undefined as T;
    if (options.responseType === "buffer") {
      return Buffer.from(await response.arrayBuffer()) as T;
    }
    return (await response.json()) as T;
  }

  async collect<T>(pathOrUrl: string): Promise<T[]> {
    const results: T[] = [];
    let next: string | undefined = pathOrUrl;
    while (next) {
      const page: GraphCollection<T> = await this.request<GraphCollection<T>>(next);
      results.push(...page.value);
      next = page["@odata.nextLink"];
    }
    return results;
  }

  private async send(pathOrUrl: string, options: GraphRequestOptions): Promise<Response> {
    const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH_BASE_URL}${pathOrUrl}`;
    const method = options.method ?? "GET";
    const canRetry = method === "GET";
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const accessToken = await this.tokenProvider.getAccessToken();
      try {
        const response = await this.fetchImplementation(url, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken.token}`,
            Accept: "application/json",
            ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
            ...options.headers,
          },
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });
        if (response.ok) return response;

        const responseBody = await response.text();
        const requestId =
          response.headers.get("request-id") ??
          response.headers.get("client-request-id") ??
          undefined;
        const error = new GraphRequestError(
          `Microsoft Graph request failed with ${response.status}`,
          response.status,
          requestId,
          responseBody,
        );
        if (!canRetry || !isRetryable(response.status) || attempt === this.maxAttempts) throw error;
        await delay(retryDelay(response, attempt));
        lastError = error;
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        if (error instanceof GraphRequestError || !canRetry || attempt === this.maxAttempts) {
          throw normalized;
        }
        lastError = normalized;
        await delay(250 * 2 ** (attempt - 1));
      }
    }
    throw lastError ?? new Error("Microsoft Graph request failed");
  }
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 503 || status === 504;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);
  }
  return Math.min(500 * 2 ** (attempt - 1), 10_000);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
