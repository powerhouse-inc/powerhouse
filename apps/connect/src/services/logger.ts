import { captureException } from '@sentry/react';
import { ConsoleLogger, ILogger, setLogger } from 'document-drive/logger';

function captureSentryException(...data: any[]) {
    let error: unknown;
    let info: any[] | undefined;
    const errorIndex = data.findIndex(item => item instanceof Error);
    if (errorIndex) {
        error = data.at(errorIndex) as Error;
        info = data.slice(0, errorIndex).concat(data.slice(errorIndex + 1));
    } else if (data.length === 1) {
        error = data;
    } else if (data.length > 1) {
        error = data[0];
        info = data.slice(1);
    }

    // checks if it's a failed fetch request
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
        // if the user is offline then doesn't emit to sentry
        if (!navigator.onLine) {
            return;
        }
    }

    captureException(error, info ? { data: info } : undefined);
}

export const logger: ILogger = new ConsoleLogger([], captureSentryException);
setLogger(logger);
