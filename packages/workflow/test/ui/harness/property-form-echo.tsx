// Mounts PropertyForm over a stand-in document whose saves echo back one by one
// echoMs apart; __setForm is an outside edit.
import { QueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DesignTimeProvider } from "../../../editors/workflow-editor/ui/design-time.js";
import type { BlockFormProp } from "../../../editors/workflow-editor/ui/forms.js";
import type { PropertySettingModel } from "../../../editors/workflow-editor/ui/model.js";
import { PropertyForm } from "../../../editors/workflow-editor/ui/PropertyForm.js";

export interface PropertyFormEchoHarness {
  value: Record<string, unknown>;
  echoMs: number;
}

export interface SavedForm {
  value: Record<string, unknown>;
  settings: PropertySettingModel[] | null;
}

const field = (
  name: string,
  type: string,
  extra: Partial<BlockFormProp> = {},
) =>
  ({
    name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    type,
    required: false,
    ...extra,
  }) as BlockFormProp;

const PROPS: BlockFormProp[] = [
  field("title", "SHORT_TEXT"),
  field("enabled", "CHECKBOX"),
  field("format", "STATIC_DROPDOWN", {
    staticOptions: [
      { label: "Plain", value: "plain" },
      { label: "Markdown", value: "markdown" },
      { label: "HTML", value: "html" },
    ],
  }),
  field("items", "ARRAY", { properties: [field("label", "SHORT_TEXT")] }),
  field("headers", "OBJECT"),
];

function Harness(props: PropertyFormEchoHarness) {
  const [saved, setSaved] = useState<SavedForm>({
    value: props.value,
    settings: null,
  });
  const queue = useRef(Promise.resolve());
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  useEffect(() => {
    (window as unknown as { __setForm: typeof setSaved }).__setForm = setSaved;
  }, []);
  return (
    <DesignTimeProvider queryClient={queryClient} scope="harness">
      <div className="flex gap-6 p-6">
        <div className="w-[400px] shrink-0 rounded-lg border border-solid border-foreground/10 bg-background p-4">
          <PropertyForm
            props={PROPS}
            value={saved.value}
            settings={saved.settings}
            writesSettings
            onChange={(value, settings) => {
              queue.current = queue.current.then(
                () =>
                  new Promise<void>((resolve) =>
                    setTimeout(() => {
                      setSaved((prev) => ({
                        value,
                        settings: settings ?? prev.settings,
                      }));
                      resolve();
                    }, props.echoMs),
                  ),
              );
            }}
          />
        </div>
        <pre data-testid="saved" className="text-xs">
          {JSON.stringify(saved)}
        </pre>
      </div>
    </DesignTimeProvider>
  );
}

/** Replaces the page with the harness. */
export function mount(props: PropertyFormEchoHarness): void {
  document.body.innerHTML = "";
  const root = document.createElement("div");
  root.className = "bg-background text-foreground min-h-screen overflow-auto";
  document.body.appendChild(root);
  createRoot(root).render(<Harness {...props} />);
}
