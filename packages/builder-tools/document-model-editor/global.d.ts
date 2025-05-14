import { type LogLevel } from "#document-model-editor/types";

declare global {
  interface Window {
    POWERHOUSE_LOG_LEVEL: LogLevel;
  }
}
