import { captureException } from '@sentry/react';
import { ILogger, setLogger } from 'document-drive';

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

class ConnectLogger implements ILogger {
    #logger: ILogger = console;

    constructor() {
        // Bind all methods to the current instance
        this.log = this.log.bind(this);
        this.info = this.info.bind(this);
        this.warn = this.warn.bind(this);
        this.error = this.error.bind(this);
        this.debug = this.debug.bind(this);
        this.trace = this.trace.bind(this);
    }

    set logger(logger: ILogger) {
        this.#logger = logger;
    }

    log(...data: any[]): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        return this.#logger.log(...data);
    }

    info(...data: any[]): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        return this.#logger.info(...data);
    }

    warn(...data: any[]): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        return this.#logger.warn(...data);
    }

    error(...data: any[]): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        captureSentryException(...data);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        return this.#logger.error(...data);
    }

    debug(...data: any[]): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        return this.#logger.debug(...data);
    }

    trace(...data: any[]): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        return this.#logger.trace(...data);
    }
}

export const logger: ILogger = new ConnectLogger();

setLogger(logger);
