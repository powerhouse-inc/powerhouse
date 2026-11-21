import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { createRemoteAttachmentService } from "@powerhousedao/reactor-attachments";
import {
  DEFAULT_SWITCHBOARD_URL,
  getSwitchboardGatewayUrlFromDriveUrl,
  useSelectedDrive,
} from "@powerhousedao/reactor-browser";
import { useSelectedChatSessionDocument } from "document-models/chat-session";
import { useMemo } from "react";
import { ChatSession } from "./ChatSession.js";

export { ChatSession } from "./ChatSession.js";
export type { ChatSessionProps } from "./ChatSession.js";
export type { RenderFailureAction } from "./components/chat-actions.js";
export type {
  ToolRenderProps,
  ToolRenderer,
  ToolRenderers,
  ToolRenderState,
} from "./components/tool-rendering.js";

export default function Editor() {
  const [document, dispatch] = useSelectedChatSessionDocument();
  const [drive] = useSelectedDrive();

  // Derive the switchboard base URL from the drive's remote URL when available,
  // so uploads land on the same switchboard that serves the document.
  const driveRemoteUrl: string | undefined = (
    drive?.state?.local as { remoteUrl?: string } | undefined
  )?.remoteUrl;

  const attachmentService = useMemo(
    () =>
      createRemoteAttachmentService({
        remoteUrl: driveRemoteUrl
          ? getSwitchboardGatewayUrlFromDriveUrl(driveRemoteUrl)
          : DEFAULT_SWITCHBOARD_URL,
      }),
    [driveRemoteUrl],
  );

  return (
    <ChatSession
      document={document}
      dispatch={dispatch}
      className="absolute inset-0"
      header={<DocumentToolbar />}
      attachments={attachmentService}
    />
  );
}
