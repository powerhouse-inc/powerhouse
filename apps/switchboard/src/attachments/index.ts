import type { API } from "@powerhousedao/reactor-api";
import { mountAuthenticatedNodeRoute } from "./mount-auth.js";
import {
  makeDeleteReservationHandler,
  makeDownloadHandler,
  makeDownloadTargetHandler,
  makeGetReservationHandler,
  makeReserveHandler,
  makeStatHandler,
  makeUploadHandler,
} from "./routes.js";

export function registerAttachmentRoutes(api: API): void {
  const { attachments } = api;

  mountAuthenticatedNodeRoute(
    api,
    "POST",
    "/attachments/reservations",
    makeReserveHandler(attachments),
  );

  mountAuthenticatedNodeRoute(
    api,
    "GET",
    "/attachments/reservations/:reservationId",
    makeGetReservationHandler(attachments),
  );

  mountAuthenticatedNodeRoute(
    api,
    "DELETE",
    "/attachments/reservations/:reservationId",
    makeDeleteReservationHandler(attachments),
  );

  mountAuthenticatedNodeRoute(
    api,
    "PUT",
    "/attachments/reservations/:reservationId",
    makeUploadHandler(attachments),
  );

  mountAuthenticatedNodeRoute(
    api,
    "HEAD",
    "/attachments/:hash",
    makeStatHandler(attachments),
  );

  mountAuthenticatedNodeRoute(
    api,
    "GET",
    "/attachments/:hash/download-target",
    makeDownloadTargetHandler(attachments, api.attachmentAccess),
  );

  mountAuthenticatedNodeRoute(
    api,
    "GET",
    "/attachments/:hash",
    makeDownloadHandler(attachments),
  );
}
