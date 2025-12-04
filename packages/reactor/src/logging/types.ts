export type LoggerErrorHandler = (...data: any[]) => void;

export type ILogger = {
  level: "verbose" | "debug" | "info" | "warn" | "error";

  verbose: (message: string, ...replacements: any[]) => void;
  debug: (message: string, ...replacements: any[]) => void;
  info: (message: string, ...replacements: any[]) => void;
  warn: (message: string, ...replacements: any[]) => void;
  error: (message: string, ...replacements: any[]) => void;

  errorHandler: LoggerErrorHandler;
};
