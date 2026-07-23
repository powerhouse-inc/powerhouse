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

  // Anonymous-capable: the handler authorizes document-anchored reservations
  // via the document's write permission and still requires an identity for
  // unanchored ones.
  mountAuthenticatedNodeRoute(
    api,
    "POST",
    "/attachments/reservations",
    makeReserveHandler(attachments, api.attachmentAccess),
    { allowAnonymous: true },
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

  // Anonymous-capable: authorization is purely the document's — canRead plus
  // the reference index decide, exactly as they do for the document itself.
  mountAuthenticatedNodeRoute(
    api,
    "GET",
    "/attachments/:hash/download-target",
    makeDownloadTargetHandler(attachments, api.attachmentAccess),
    { allowAnonymous: true },
  );

  mountAuthenticatedNodeRoute(
    api,
    "GET",
    "/attachments/:hash",
    makeDownloadHandler(attachments),
  );
}
