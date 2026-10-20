import {
  getAiSettings,
  isAiConfigured,
  updateAiSettings,
  type AiSettings,
} from "@powerhousedao/reactor-browser/ai";
import { Bot } from "lucide-react";
import { useState } from "react";

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

const FIELD_CLASS =
  "w-full rounded-md border border-border bg-background p-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground";

/**
 * Settings-modal section for the in-browser AI assistant: the user master
 * toggle, the OpenAI-compatible endpoint configuration, and a
 * save-and-test-connection action. Only mounted when the deployment
 * enables the feature (`connect.ai.assistantEnabled`).
 */
export const AiAssistant: React.FC = () => {
  const [draft, setDraft] = useState<AiSettings>(() => getAiSettings());
  const [test, setTest] = useState<TestState>({ status: "idle" });

  const patch = (value: Partial<AiSettings>) =>
    setDraft((d) => ({ ...d, ...value }));

  const saveAndTest = async () => {
    updateAiSettings(draft);
    if (!isAiConfigured(draft)) {
      setTest({
        status: "error",
        message: "Base URL, API key and model are all required.",
      });
      return;
    }
    setTest({ status: "testing" });
    try {
      const base = draft.baseUrl.trim().replace(/\/+$/, "");
      const res = await fetch(`${base}/models`, {
        headers: draft.apiKey.trim()
          ? { Authorization: `Bearer ${draft.apiKey.trim()}` }
          : undefined,
      });
      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`,
        );
      }
      const data: unknown = await res.json();
      const list = (data as { data?: unknown[] } | null)?.data;
      const count = Array.isArray(list) ? list.length : 0;
      setTest({
        status: "ok",
        message: count
          ? `Connected — ${count} model(s) available.`
          : "Connected.",
      });
    } catch (error) {
      setTest({
        status: "error",
        message: `Connection failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  };

  return (
    <div className="space-y-4 p-1">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Bot size={16} /> AI Assistant
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          An in-page assistant that creates and changes documents, manages
          drives, and inspects read models through an OpenAI-compatible
          endpoint.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => {
            patch({ enabled: event.target.checked });
            // The switch acts immediately: the FAB mounts/unmounts at once.
            updateAiSettings({ enabled: event.target.checked });
          }}
        />
        Enable AI assistant
      </label>

      {draft.enabled && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Endpoint
          </div>
          <input
            type="url"
            placeholder="Base URL (e.g. https://api.openai.com/v1)"
            value={draft.baseUrl}
            onChange={(e) => patch({ baseUrl: e.target.value })}
            className={FIELD_CLASS}
            spellCheck={false}
          />
          <input
            type="password"
            placeholder="API key"
            value={draft.apiKey}
            onChange={(e) => patch({ apiKey: e.target.value })}
            className={FIELD_CLASS}
            autoComplete="off"
            spellCheck={false}
          />
          <input
            type="text"
            placeholder="Model (e.g. gpt-4o-mini)"
            value={draft.model}
            onChange={(e) => patch({ model: e.target.value })}
            className={FIELD_CLASS}
            spellCheck={false}
          />
          <label className="flex items-center gap-2 pt-1 text-sm text-foreground">
            <input
              type="checkbox"
              checked={draft.autoApproveWrites}
              onChange={(event) =>
                patch({ autoApproveWrites: event.target.checked })
              }
            />
            Auto-approve write actions
          </label>
          <p className="text-xs text-muted-foreground">
            Requests go directly from this browser to the endpoint; the API key
            is never sent to Powerhouse servers. The endpoint must allow
            cross-origin (CORS) requests from this site.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => void saveAndTest()}
              disabled={test.status === "testing"}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:disabled-effect"
            >
              {test.status === "testing"
                ? "Testing…"
                : "Save & test connection"}
            </button>
            {test.status === "ok" && (
              <span className="text-xs text-foreground">{test.message}</span>
            )}
            {test.status === "error" && (
              <span className="text-xs text-destructive">{test.message}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
