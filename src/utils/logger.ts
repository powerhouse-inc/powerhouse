import winston from 'winston';

export const logger = winston.createLogger({
    level: 'info',
    defaultMeta: { service: "document-drive" },
    // format: winston.format.colorize(),
    transports: [new winston.transports.Console()],
});
