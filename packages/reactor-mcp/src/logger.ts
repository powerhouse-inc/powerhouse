import { childLogger, type ILogger } from "document-model";

export const logger: ILogger = childLogger(["reactor-mcp"]);
