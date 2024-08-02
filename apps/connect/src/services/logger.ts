/* eslint-disable @typescript-eslint/no-explicit-any */
import { captureException } from '@sentry/react';
import { ILogger, setLogger } from 'document-drive/logger';

class ConnectLogger implements ILogger {
    #logger: ILogger = console;

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
        const errorIndex = data.findIndex(item => item instanceof Error);
        if (errorIndex) {
            const error = data.at(errorIndex) as Error;
            const info = data
                .slice(0, errorIndex)
                .concat(data.slice(errorIndex + 1));
            captureException(error, { data: info });
        } else if (data.length === 1) {
            captureException(data.at(0));
        } else if (data.length > 1) {
            captureException(data[0], { data: data.slice(1) });
        }
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
