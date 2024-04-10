import winston from 'winston';
import Sentry from 'winston-sentry-log';

export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [new winston.transports.Console()],
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    const options = {
        config: {
            dsn: process.env.SENTRY_DSN,
        },
        level: 'info',
    };
    logger.add(new Sentry(options));
}
