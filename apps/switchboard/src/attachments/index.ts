import type { API } from "@powerhousedao/reactor-api";
import { mountAuthenticatedNodeRoute } from "./mount-auth.js";
import {
  makeDownloadHandler,
  makeReserveHandler,
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
    "PUT",
    "/attachments/reservations/:reservationId",
    makeUploadHandler(attachments),
  );

  mountAuthenticatedNodeRoute(
    api,
    "GET",
    "/attachments/:hash",
    makeDownloadHandler(attachments),
  );
}
