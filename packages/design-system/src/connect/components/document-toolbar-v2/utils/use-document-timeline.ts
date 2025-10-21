import {
  useSelectedDocument,
  useTimelineItems,
} from "@powerhousedao/reactor-browser";

export function useDocumentTimeline() {
  const [document] = useSelectedDocument();
  const documentId = document?.header.id;
  const createdAt = document?.header.createdAtUtcIso;
  const timelineItems = useTimelineItems(documentId, createdAt);

  return timelineItems.data || [];
}
