import { Button } from "../../ui/button.js";

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
    <div
      data-testid="ph-diagram-unavailable"
      role="status"
      className="flex min-h-56 flex-col items-center justify-center rounded-md border px-6 py-8 text-center"
    >
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mt-1 max-w-md text-[13px] text-muted-foreground">
        {detail}
      </p>
      {reason && (
        <p className="mt-3 max-w-full rounded-md bg-foreground/[0.04] px-2.5 py-1.5 text-left font-mono text-[11.5px] [overflow-wrap:anywhere] text-muted-foreground">
          {reason}
        </p>
      )}
      <Button variant="outline" size="sm" className="mt-4" onClick={onShowSdl}>
        Show SDL
      </Button>
    </div>
  );
}
