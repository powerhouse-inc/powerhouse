import winston from 'winston';
import Sentry from 'winston-sentry-log';

export const logger = winston.createLogger({
    level: 'info',
    // format: winston.format.colorize(),
    transports: [new winston.transports.Console()],
});

if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    const options = {
        config: {
            dsn: process.env.SENTRY_DSN,
        },
        level: 'info',
    };
    logger.add(new Sentry(options));
}
