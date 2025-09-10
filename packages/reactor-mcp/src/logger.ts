import type { ILogger } from "document-drive";
import { childLogger } from "document-drive";

export const logger: ILogger = childLogger(["reactor-mcp"]);
