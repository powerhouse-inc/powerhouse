import { Network } from "lucide-react";
import { EmptyState } from "../../../components/empty-state.js";
import { Button } from "../../../ui/button.js";

/** In place of the diagram when it cannot be drawn, with the way back to
 * the SDL. */
export function DiagramUnavailable({
  title,
  detail,
  reason,
  onShowSdl,
}: {
  title: string;
  detail: string;
  reason?: string;
  onShowSdl: () => void;
}) {
  return (
    <EmptyState
      data-testid="ph-diagram-unavailable"
      role="status"
      icon={Network}
      compact
      title={title}
      reason={reason}
      action={
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={onShowSdl}>
            Show SDL
          </Button>
        </div>
      }
      className="min-h-56 max-w-none justify-center rounded-md border"
    >
      {detail}
    </EmptyState>
  );
}
