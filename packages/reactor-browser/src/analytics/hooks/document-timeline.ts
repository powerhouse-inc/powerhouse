import { useDocumentById } from "@powerhousedao/reactor-browser";
import { useTimelineItems } from "./timeline-items.js";

export function useDocumentTimeline(documentId?: string) {
  const [document] = useDocumentById(documentId);

  const id = document?.header.id;
  const createdAt = document?.header.createdAtUtcIso;
  const timelineItems = useTimelineItems(id, createdAt);

  return timelineItems.data || [];
}
