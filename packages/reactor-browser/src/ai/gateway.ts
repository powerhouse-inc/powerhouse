import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ambientRenownTokenProvider,
  type BearerTokenProvider,
} from "../graphql-client/auth.js";
import { useUser } from "../hooks/renown.js";
import type { AiConnection } from "./types.js";

/**
 * The switchboard's AI gateway (`@powerhousedao/switchboard/plugins/ai`). It
 * sits under `/api/`, which every Connect served next to its switchboard
 * proxies, so by default the browser calls its own origin.
 */
export const AI_GATEWAY_PATH = "/api/@powerhousedao/switchboard/ai";

export interface AiGatewayStatus {
  configured: boolean;
  /** Masked, e.g. `sk-or-v1-…abcd`. The key itself is never sent. */
  keyHint: string | null;
  keySetBy: string | null;
  keySetAt: string | null;
  model: string;
}

/**
 * What the signed-in user may do with the gateway: `none` when they are not
 * an admin, are not signed in, or this host has no gateway at all.
 */
export type AiGatewayAccess =
  | { access: "none" }
  | { access: "admin"; status: AiGatewayStatus }
  | { access: "error"; message: string };

export interface AiGatewayOptions {
  /** The gateway's URL; defaults to {@link AI_GATEWAY_PATH} on this origin. */
  url?: string;
  /** Test seams. */
  tokenProvider?: BearerTokenProvider;
  fetchImpl?: typeof fetch;
}

/** A fetch that adds the user's bearer, resolved per request so it stays fresh. */
export function gatewayFetch(options: AiGatewayOptions = {}): typeof fetch {
  const tokenProvider = options.tokenProvider ?? ambientRenownTokenProvider;
  return async (input, init) => {
    const token = await tokenProvider();
    const headers = new Headers(init?.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    const fetchImpl = options.fetchImpl ?? fetch;
    return fetchImpl(input, { ...init, headers });
  };
}

/** The chat connection to a gateway: no key, only the user's own bearer. */
export function gatewayConnection(
  model: string,
  options: AiGatewayOptions = {},
): AiConnection {
  return {
    baseUrl: `${options.url ?? AI_GATEWAY_PATH}/v1`,
    model,
    fetch: gatewayFetch(options),
  };
}

function refusalMessage(body: unknown, status: number): string {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === "string") return error;
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string"
    ? message
    : `The assistant answered HTTP ${status}.`;
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function adminCall(
  path: string,
  init: RequestInit,
  options: AiGatewayOptions,
): Promise<AiGatewayStatus> {
  const url = `${options.url ?? AI_GATEWAY_PATH}${path}`;
  const response = await gatewayFetch(options)(url, {
    ...init,
    headers: { "content-type": "application/json" },
  });
  const body = await readBody(response);
  if (!response.ok) throw new Error(refusalMessage(body, response.status));
  return body as AiGatewayStatus;
}

export async function fetchAiGatewayAccess(
  options: AiGatewayOptions = {},
): Promise<AiGatewayAccess> {
  const url = `${options.url ?? AI_GATEWAY_PATH}/status`;
  let response: Response;
  try {
    response = await gatewayFetch(options)(url);
  } catch (error) {
    return {
      access: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  // Signed out, not an admin, or nothing mounted here. A dev server's HTML
  // fallback for an unknown path lands in the check below.
  if ([401, 403, 404].includes(response.status)) return { access: "none" };
  const body = await readBody(response);
  if (!response.ok) {
    return { access: "error", message: refusalMessage(body, response.status) };
  }
  if (typeof (body as AiGatewayStatus | undefined)?.model !== "string") {
    return { access: "none" };
  }
  return { access: "admin", status: body as AiGatewayStatus };
}

/** Tested against the provider before it is stored; a refusal throws. */
export function setAiGatewayKey(
  value: string,
  options: AiGatewayOptions = {},
): Promise<AiGatewayStatus> {
  return adminCall(
    "/key",
    { method: "PUT", body: JSON.stringify({ value }) },
    options,
  );
}

export function resetAiGatewayKey(
  options: AiGatewayOptions = {},
): Promise<AiGatewayStatus> {
  return adminCall("/key", { method: "DELETE" }, options);
}

export function setAiGatewayModel(
  model: string,
  options: AiGatewayOptions = {},
): Promise<AiGatewayStatus> {
  return adminCall(
    "/model",
    { method: "PUT", body: JSON.stringify({ model }) },
    options,
  );
}

export interface UseAiGatewayResult {
  /** `undefined` until the first answer. */
  gateway: AiGatewayAccess | undefined;
  /** Connection for {@link useReactorChat}, once the gateway has a key. */
  connection: AiConnection | undefined;
  setKey: (value: string) => Promise<void>;
  resetKey: () => Promise<void>;
}

/** The gateway as the signed-in user sees it; asks again when they change. */
export function useAiGateway(): UseAiGatewayResult {
  const address = useUser()?.address;
  const [gateway, setGateway] = useState<AiGatewayAccess>();

  useEffect(() => {
    let current = true;
    setGateway(undefined);
    void fetchAiGatewayAccess().then((answer) => {
      if (current) setGateway(answer);
    });
    return () => {
      current = false;
    };
  }, [address]);

  const setKey = useCallback(async (value: string) => {
    const status = await setAiGatewayKey(value);
    setGateway({ access: "admin", status });
  }, []);

  const resetKey = useCallback(async () => {
    const status = await resetAiGatewayKey();
    setGateway({ access: "admin", status });
  }, []);

  const ready =
    gateway?.access === "admin" && gateway.status.configured
      ? gateway.status.model
      : undefined;
  const connection = useMemo(
    () => (ready ? gatewayConnection(ready) : undefined),
    [ready],
  );

  return { gateway, connection, setKey, resetKey };
}
