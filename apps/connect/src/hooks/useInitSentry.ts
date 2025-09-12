import { connectConfig } from "@powerhousedao/connect/config";

import type { BrowserOptions } from "@sentry/react";

import { childLogger } from "document-drive";
import React, { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import { useAcceptedCookies } from "./useAcceptedCookies.js";

const logger = childLogger(["sentry"]);

let clientStarted = false;

async function getSentry() {
  return await import("@sentry/react");
}

async function initSentry() {
  const release = import.meta.env.SENTRY_RELEASE;

  const Sentry = await getSentry();
  const integrations: BrowserOptions["integrations"] = [
    Sentry.httpClientIntegration(),
    Sentry.extraErrorDataIntegration({ depth: 5 }),
    Sentry.replayIntegration(),
    Sentry.captureConsoleIntegration({ levels: ["error"] }),
  ];
  if (connectConfig.sentry.tracing) {
    integrations.push(
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect: React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    );
  }

  Sentry.init({
    release,
    dsn: connectConfig.sentry.dsn,
    environment: connectConfig.sentry.env,
    integrations,
    ignoreErrors: [
      "User is not allowed to create files",
      "User is not allowed to move documents",
      "The user aborted a request.",
    ],
    sendDefaultPii: true,
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event, hint) {
      const error = hint.originalException;
      if (
        error instanceof TypeError &&
        error.message.includes("Failed to fetch") &&
        !navigator.onLine
      ) {
        // If fetch fails because user is offline then ignores the error
        return null;
      }
      return event;
    },
  });

  clientStarted = true;
}

async function closeClient() {
  if (!clientStarted) {
    return;
  }
  const sentry = await getSentry();
  const client = sentry.getClient();
  return client?.close();
}

export function useInitSentry() {
  const [acceptedCookies] = useAcceptedCookies();
  const { analytics } = acceptedCookies;

  useEffect(() => {
    if (!analytics) {
      closeClient().catch((error: unknown) => logger.error(error));
      return;
    }

    if (
      clientStarted ||
      !connectConfig.sentry.dsn ||
      connectConfig.sentry.dsn === ""
    ) {
      return;
    }

    initSentry().catch((error: unknown) => logger.error(error));
  }, [analytics]);
}
