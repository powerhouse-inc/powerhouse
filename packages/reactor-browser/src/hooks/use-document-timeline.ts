import { useDocumentById } from "./document-by-id.js";
import { useTimelineItems } from "./use-timeline-items.js";

export function useDocumentTimeline(documentId?: string) {
  const [document] = useDocumentById(documentId);

  const id = document?.header.id;
  const createdAt = document?.header.createdAtUtcIso;
  const timelineItems = useTimelineItems(id, createdAt);

  return timelineItems.data || [];
}
