// Mounts ScheduleBuilder over a stand-in document whose saves echo back one by
// one echoMs apart, or coalesced into the last; __setSchedule is an outside edit.
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ScheduleBuilder } from "../../../editors/workflow-editor/ui/ScheduleBuilder.js";

export interface ScheduleHarness {
  config: Record<string, unknown>;
  echoMs: number;
  coalesce?: boolean;
}

function Harness(props: ScheduleHarness) {
  const [config, setConfig] = useState<unknown>(props.config);
  const queue = useRef(Promise.resolve());
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    (window as unknown as { __setSchedule: typeof setConfig }).__setSchedule =
      setConfig;
  }, []);
  return (
    <div className="flex gap-6 p-6">
      <div className="w-[400px] shrink-0 rounded-lg border border-solid border-foreground/10 bg-background p-4">
        <ScheduleBuilder
          config={config}
          onChange={(next) => {
            if (props.coalesce) {
              clearTimeout(pending.current);
              pending.current = setTimeout(() => setConfig(next), props.echoMs);
              return;
            }
            queue.current = queue.current.then(
              () =>
                new Promise<void>((resolve) =>
                  setTimeout(() => {
                    setConfig(next);
                    resolve();
                  }, props.echoMs),
                ),
            );
          }}
        />
      </div>
      <pre data-testid="config" className="text-xs">
        {JSON.stringify(config)}
      </pre>
    </div>
  );
}

/** Replaces the page with the harness. */
export function mount(props: ScheduleHarness): void {
  document.body.innerHTML = "";
  const root = document.createElement("div");
  root.className = "bg-background text-foreground min-h-screen overflow-auto";
  document.body.appendChild(root);
  createRoot(root).render(<Harness {...props} />);
}
