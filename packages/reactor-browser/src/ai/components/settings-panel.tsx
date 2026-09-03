import type { ChangeEvent } from "react";
import { updateAiSettings } from "../settings-store.js";
import type { AiSettings } from "../types.js";

const FIELD_CLASS =
  "w-full rounded-md border border-border bg-background p-2.5 text-sm font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground";

/**
 * Endpoint + model configuration for the chat agent. Values persist to
 * localStorage on every change; the API key is only ever sent to the
 * configured endpoint.
 *
 * Deliberately uses plain form elements (no design-system dependency): this
 * module is consumed inside `@powerhousedao/reactor-browser`, which sits
 * below the design system in the dependency graph.
 */
export function AiSettingsPanel({ settings }: { settings: AiSettings }) {
  const onChange =
    (field: "baseUrl" | "apiKey" | "model") =>
    (event: ChangeEvent<HTMLInputElement>) =>
      updateAiSettings({ [field]: event.target.value });

  return (
    <div className="border-b border-border bg-background px-4 py-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        AI endpoint
      </div>
      <div className="space-y-2">
        <input
          type="url"
          placeholder="https://api.openai.com/v1"
          value={settings.baseUrl}
          onChange={onChange("baseUrl")}
          className={FIELD_CLASS}
          spellCheck={false}
        />
        <input
          type="password"
          placeholder="API key"
          value={settings.apiKey}
          onChange={onChange("apiKey")}
          className={FIELD_CLASS}
          autoComplete="off"
          spellCheck={false}
        />
        <input
          type="text"
          placeholder="Model (e.g. gpt-4o-mini)"
          value={settings.model}
          onChange={onChange("model")}
          className={FIELD_CLASS}
          spellCheck={false}
        />
        <label className="flex items-center gap-2 pt-1 text-sm text-foreground">
          <input
            type="checkbox"
            checked={settings.autoApproveWrites}
            onChange={(event) =>
              updateAiSettings({ autoApproveWrites: event.target.checked })
            }
          />
          Auto-approve write actions
        </label>
        <p className="text-xs text-muted-foreground">
          Requests go directly from this browser to the endpoint; the API key is
          never sent to Powerhouse servers. The endpoint must allow cross-origin
          (CORS) requests from this site.
        </p>
      </div>
    </div>
  );
}
