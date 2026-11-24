import type { ProjectReader } from "../api.js";
import { devtoolsTokenTag } from "../host.js";
import {
  createDevtoolsApiHandler,
  createDevtoolsToken,
  type DevtoolsApiHandler,
} from "./handler.js";
import { createProjectReader } from "./project/reader.js";
import { readStack, type DevtoolsStackOptions } from "./stack.js";

export type DevtoolsServerOptions = DevtoolsStackOptions & {
  /** The base path the server serves the app under. "/" by default. */
  base?: string;
  /** In place of the reader DevTools makes for `projectRoot`. */
  project?: ProjectReader;
};

export type DevtoolsServer = {
  /** Answers the API's paths and hands every other request to `next`. It
   * goes ahead of the app's own routes. */
  handler: DevtoolsApiHandler;
  /** The tag for the `<head>` of every page the server serves. It is what
   * turns DevTools on in the page. */
  tokenTag: string;
};

/**
 * DevTools for a development server that is not Vite's: the API as a Node
 * `(req, res, next)` handler, and the tag for the page. The API reads the
 * project's files for the browser, so this refuses to start under
 * `NODE_ENV=production`.
 */
export function createDevtoolsServer({
  base = "/",
  project,
  ...stack
}: DevtoolsServerOptions): DevtoolsServer {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DevTools is development only: createDevtoolsServer does not run under NODE_ENV=production.",
    );
  }
  const token = createDevtoolsToken();
  return {
    tokenTag: devtoolsTokenTag(token, base),
    handler: createDevtoolsApiHandler({
      token,
      base,
      info: () => readStack(stack),
      project: project ?? createProjectReader(stack.projectRoot),
    }),
  };
}
