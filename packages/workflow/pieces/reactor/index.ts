// The Powerhouse reactor piece: documents and document models as workflow
// blocks, for the reactor the workflow itself runs in.

// It reaches the reactor through ctx.reactor, which the host serves over the
// worker's call channel — piece code never holds a reactor client, and a copy
// of this piece fetched from a registry would find the member throwing.
import { createPiece } from "@powerhousedao/pieces-framework";
import { POWERHOUSE_LOGO } from "./lib/logo.js";
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

export const reactor = createPiece({
  displayName: "Powerhouse Reactor",
  description:
    "Read and write Powerhouse documents on the reactor this workflow runs in: create documents, dispatch actions, read state and schemas, and fire on document events.",
  logoUrl: POWERHOUSE_LOGO,
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
