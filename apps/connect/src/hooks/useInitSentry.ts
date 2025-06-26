import config from '#connect-config';
import { useAcceptedCookies } from '@powerhousedao/common';
import * as Sentry from '@sentry/react';
import React, { useEffect } from 'react';
import {
    createRoutesFromChildren,
    matchRoutes,
    useLocation,
    useNavigationType,
} from 'react-router-dom';

export function useInitSentry() {
    const acceptedCookies = useAcceptedCookies();

    useEffect(() => {
        const client = Sentry.getClient();
        if (!acceptedCookies.analytics) {
            if (client) {
                void client.close();
            }
            return;
        }

        if (client || !config.sentry.dsn || config.sentry.dsn === '') {
            return;
        }

        const release = import.meta.env.SENTRY_RELEASE;

        const integrations: Sentry.BrowserOptions['integrations'] = [
            Sentry.httpClientIntegration(),
            Sentry.extraErrorDataIntegration({ depth: 5 }),
            Sentry.replayIntegration(),
            Sentry.captureConsoleIntegration({ levels: ['error'] }),
        ];
        if (config.sentry.tracing) {
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
            dsn: config.sentry.dsn,
            environment: config.sentry.env,
            integrations,
            ignoreErrors: [
                'User is not allowed to create files',
                'User is not allowed to move documents',
                'The user aborted a request.',
            ],
            sendDefaultPii: true,
            tracesSampleRate: 1.0,
            replaysSessionSampleRate: 0.1,
            replaysOnErrorSampleRate: 1.0,
            beforeSend(event, hint) {
                const error = hint.originalException;
                if (
                    error instanceof TypeError &&
                    error.message.includes('Failed to fetch') &&
                    !navigator.onLine
                ) {
                    // If fetch fails because user is offline then ignores the error
                    return null;
                }
                return event;
            },
        });
    }, [acceptedCookies.analytics]);
}
