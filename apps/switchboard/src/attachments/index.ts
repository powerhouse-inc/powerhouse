import type { API } from "@powerhousedao/reactor-api";
import { requireAuth } from "./auth.js";
import {
  makeDownloadHandler,
  makeReserveHandler,
  makeUploadHandler,
} from "./routes.js";

export function registerAttachmentRoutes(api: API): void {
  const { httpAdapter, attachments, authService } = api;

  httpAdapter.mountNodeRoute(
    "POST",
    "/attachments/reservations",
    requireAuth(authService, makeReserveHandler(attachments)),
  );

  httpAdapter.mountNodeRoute(
    "PUT",
    "/attachments/reservations/:reservationId",
    requireAuth(authService, makeUploadHandler(attachments)),
  );

  httpAdapter.mountNodeRoute(
    "GET",
    "/attachments/:hash",
    requireAuth(authService, makeDownloadHandler(attachments)),
  );
}
