import type { API } from "@powerhousedao/reactor-api";
import { childLogger } from "document-model";
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
import {
  ATTACHMENT_URL_SIGNING_SECRET_ENV,
  resolveAttachmentUrlSigning,
  type AttachmentUrlSigner,
} from "./url-signer.js";

const logger = childLogger(["switchboard", "attachments"]);

export type RegisterAttachmentRoutesOptions = {
  /** Overrides the signer resolved from the environment; null disables signing. */
  urlSigner?: AttachmentUrlSigner | null;
};

export function registerAttachmentRoutes(
  api: API,
  options: RegisterAttachmentRoutesOptions = {},
): void {
  const { attachments, attachmentAccess } = api;
  const urlSigner =
    options.urlSigner === undefined
      ? signerFromEnvironment(attachments.backend?.kind ?? "filesystem")
      : options.urlSigner;

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

  // Anonymous-capable: authorization is purely the document's (or a signed
  // URL minted under it), exactly as it is for the document itself.
  mountAuthenticatedNodeRoute(
    api,
    "HEAD",
    "/attachments/:hash",
    makeStatHandler(attachments, attachmentAccess, urlSigner),
    { allowAnonymous: true },
  );

  mountAuthenticatedNodeRoute(
    api,
    "GET",
    "/attachments/:hash/download-target",
    makeDownloadTargetHandler(attachments, attachmentAccess, urlSigner),
    { allowAnonymous: true },
  );

  mountAuthenticatedNodeRoute(
    api,
    "GET",
    "/attachments/:hash",
    makeDownloadHandler(attachments, attachmentAccess, urlSigner),
    { allowAnonymous: true },
  );
}

function signerFromEnvironment(
  backend: "filesystem" | "s3",
): AttachmentUrlSigner | null {
  const signing = resolveAttachmentUrlSigning();
  if (signing.status === "unconfigured") {
    if (backend === "filesystem") {
      logger.error(
        `${ATTACHMENT_URL_SIGNING_SECRET_ENV} is not set: filesystem attachment download targets are refused until it is`,
      );
    }
    return null;
  }
  if (signing.status === "ephemeral" && backend === "filesystem") {
    logger.warn(
      `${ATTACHMENT_URL_SIGNING_SECRET_ENV} is not set: signing attachment download URLs with a per-process secret`,
    );
  }
  return signing.signer;
}
