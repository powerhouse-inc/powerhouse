import * as Sentry from '@sentry/react';
import config from 'connect-config';
import React, { useEffect } from 'react';
import {
    createRoutesFromChildren,
    matchRoutes,
    useLocation,
    useNavigationType,
} from 'react-router-dom';
import { useAcceptedCookies } from './useAcceptedCookies';

export function useInitSenty() {
    const [acceptedCookies] = useAcceptedCookies();
    const { analytics } = acceptedCookies;

    useEffect(() => {
        if (!analytics) {
            console.log('>>> initSentry - no analytics');
            return;
        }

        if (!config.sentry.dsn || config.sentry.dsn === '') {
            return;
        }

        const release = import.meta.env.SENTRY_RELEASE;

        Sentry.init({
            release,
            dsn: config.sentry.dsn,
            environment: config.sentry.env,
            integrations: [
                Sentry.extraErrorDataIntegration({ depth: 5 }),
                Sentry.reactRouterV6BrowserTracingIntegration({
                    useEffect: React.useEffect,
                    useLocation,
                    useNavigationType,
                    createRoutesFromChildren,
                    matchRoutes,
                }),
                Sentry.replayIntegration(),
                Sentry.captureConsoleIntegration({ levels: ['error'] }),
            ],
            ignoreErrors: [
                'User is not allowed to create files',
                'User is not allowed to move documents',
                'The user aborted a request.',
            ],
            tracesSampleRate: 1.0,
            replaysSessionSampleRate: 0.1,
            replaysOnErrorSampleRate: 1.0,
        });
    }, [analytics]);
}
