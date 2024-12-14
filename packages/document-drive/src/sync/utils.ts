import { Optional } from "../utils/types";
import { ListenerFilter } from "./types";

export function buildListenerFilter(
  filter?: Optional<ListenerFilter>,
): ListenerFilter {
  return {
    branch: filter?.branch ?? ["*"],
    documentId: filter?.documentId ?? ["*"],
    documentType: filter?.documentType ?? ["*"],
    scope: filter?.scope ?? ["*"],
  };
}
