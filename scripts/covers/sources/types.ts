// What every source module returns, and the one way they read JSON from the network.
import type { z } from "zod";
import type { Budget, Http } from "../http";

export type Candidate = { url: string; rights: string };

export type Lookup =
  | { kind: "candidates"; candidates: Candidate[] }
  | { kind: "none"; outcome: "no-match" | "no-cover" }
  | { kind: "error"; outcome: "http-error" | "rate-limited" | "budget-exhausted"; detail: string; breaker: boolean };

/** At most this many candidates are downloaded from one source for one book. */
export const MAX_CANDIDATES = 3;

export const PUBLISHER_RIGHTS = "Cover art; copyright usually held by the publisher. Not licensed by this source.";

/** Fetches a URL as JSON and checks its shape. A 404 means the service has nothing: no-match. */
export async function getJson<T>(http: Http, url: string, schema: z.ZodType<T>, budget: Budget): Promise<{ data: T } | Lookup> {
  const response = await http.get(url, { kind: "json", budget });
  if (!response.ok) {
    if (response.status === 404) return { kind: "none", outcome: "no-match" };
    const outcome = response.outcome === "rate-limited" || response.outcome === "budget-exhausted" ? response.outcome : "http-error";
    return { kind: "error", outcome, detail: response.detail, breaker: response.breaker };
  }
  let body: unknown;
  try {
    body = JSON.parse(response.body.toString("utf8"));
  } catch {
    return { kind: "error", outcome: "http-error", detail: "unexpected response: not JSON", breaker: false };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { kind: "error", outcome: "http-error", detail: "unexpected response shape", breaker: false };
  return { data: parsed.data };
}

export const isLookup = <T>(value: { data: T } | Lookup): value is Lookup => "kind" in value;
