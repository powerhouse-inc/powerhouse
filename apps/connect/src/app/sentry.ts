import * as Sentry from '@sentry/react';
import React from 'react';
import {
    createRoutesFromChildren,
    matchRoutes,
    useLocation,
    useNavigationType,
} from 'react-router-dom';

import config from '../../connect.config';

export default () => {
    if (!config.sentry.dsn || config.sentry.dsn === '') {
        return;
    }

    Sentry.init({
        dsn: config.sentry.dsn,
        environment: config.sentry.env,
        integrations: [
            Sentry.reactRouterV6BrowserTracingIntegration({
                useEffect: React.useEffect,
                useLocation,
                useNavigationType,
                createRoutesFromChildren,
                matchRoutes,
            }),
            Sentry.replayIntegration(),
        ],

        tracesSampleRate: 1.0,
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
    });
};
