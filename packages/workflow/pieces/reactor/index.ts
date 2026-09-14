// The Powerhouse reactor piece: documents and document models as workflow
// blocks, for the reactor the workflow itself runs in.

// It reaches the reactor through ctx.reactor, which the host serves over the
// worker's call channel — piece code never holds a reactor client, and a copy
// of this piece fetched from a registry would find the member throwing.
import { createPiece } from "@activepieces/pieces-framework";
import { documentCreateAction } from "./lib/actions/document-create.js";
import { documentDispatchAction } from "./lib/actions/document-dispatch.js";
import { documentFindAction } from "./lib/actions/document-find.js";
import { documentGetAction } from "./lib/actions/document-get.js";
import { documentSchemaAction } from "./lib/actions/document-schema.js";
import { documentTypesAction } from "./lib/actions/document-types.js";
import {
  documentCreatedTrigger,
  documentDeletedTrigger,
  documentEventTrigger,
} from "./lib/triggers/document-event.js";

const LOGO =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#0f172a"/><circle cx="24" cy="24" r="5" fill="#fff"/><g fill="none" stroke="#fff" stroke-width="2"><ellipse cx="24" cy="24" rx="15" ry="7"/><ellipse cx="24" cy="24" rx="15" ry="7" transform="rotate(60 24 24)"/><ellipse cx="24" cy="24" rx="15" ry="7" transform="rotate(120 24 24)"/></g></svg>',
  );

export const reactor = createPiece({
  displayName: "Powerhouse Reactor",
  description:
    "Read and write Powerhouse documents on the reactor this workflow runs in: create documents, dispatch actions, read state and schemas, and fire on document events.",
  logoUrl: LOGO,
  authors: ["powerhouse"],
  // The reactor is reached through the host, not over a connection.
  auth: undefined,
  actions: [
    documentCreateAction,
    documentDispatchAction,
    documentGetAction,
    documentFindAction,
    documentSchemaAction,
    documentTypesAction,
  ],
  triggers: [
    documentEventTrigger,
    documentCreatedTrigger,
    documentDeletedTrigger,
  ],
});

export default reactor;
