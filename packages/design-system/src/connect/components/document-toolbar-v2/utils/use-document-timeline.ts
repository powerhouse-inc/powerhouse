import {
  useDocumentById,
  useTimelineItems,
} from "@powerhousedao/reactor-browser";

export function useDocumentTimeline(documentId?: string) {
  const [document] = useDocumentById(documentId);

  const id = document?.header.id;
  const createdAt = document?.header.createdAtUtcIso;
  const timelineItems = useTimelineItems(id, createdAt);

  return timelineItems.data || [];
}
