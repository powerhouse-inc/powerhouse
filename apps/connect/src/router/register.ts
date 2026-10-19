// Connect's own router type. Nothing imports this file, so it stays out of the
// declarations projects see; their generated tree registers their router.
import type { ConnectRouter } from "./connect-router.js";

declare module "@tanstack/react-router" {
  interface Register {
    router: ConnectRouter;
  }
}
