// clint-common's chat-session model, built (clint cannot depend on the
// package that depends on it). Its file parts carry an AttachmentRef, so a
// switchboard serves a chat attachment through the chat document. The
// cli-runner test switchboard loads this directory as a package
// (`packages.list`); build clint-common first.
export {
  ChatSessionV1,
  upgradeManifests,
} from "../../../../../clint-common/dist/node/document-models/index.mjs";
