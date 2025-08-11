import { childLogger, type ILogger } from "document-drive";

export const logger: ILogger = childLogger(["reactor-mcp"]);
