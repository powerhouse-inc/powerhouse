import * as Sentry from '@sentry/react';
import React from 'react';
import {
    createRoutesFromChildren,
    matchRoutes,
    useLocation,
    useNavigationType,
} from 'react-router-dom';
import config from '../../connect.config';
import { version } from '../../package.json';

function initSenty() {
    if (!config.sentry.dsn || config.sentry.dsn === '') {
        return;
    }

    Sentry.init({
        dsn: config.sentry.dsn,
        environment: config.sentry.env,
        release: version,
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
}

initSenty();
