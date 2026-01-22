import { JsonViewer } from "@powerhousedao/design-system/ui/components/json-viewer/json-viewer.js";
import { useMemo } from "react";
import { twMerge } from "tailwind-merge";
import { TabContent } from "../tabs/tab-content.js";
import { Tabs } from "../tabs/tabs.js";

interface DocumentStateViewerProps {
  state: Record<string, unknown>;
  ignoredScopes?: string[];
  defaultScope?: string;
  className?: string;
}

function formatScopeLabel(text: string) {
  if (!text) return ""; // Handle empty strings or null
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function DocumentStateViewer({
  state,
  ignoredScopes = ["auth", "document"],
  defaultScope,
  className,
}: DocumentStateViewerProps) {
  const scopes = useMemo(
    () => Object.keys(state).filter((scope) => !ignoredScopes.includes(scope)),
    [state, ignoredScopes],
  );

  const initialScope = defaultScope || scopes.at(0) || "global";

  if (scopes.length === 0) {
    return <div className="text-sm text-gray-500">No state data</div>;
  }

  return (
    <Tabs defaultValue={formatScopeLabel(initialScope)}>
      {scopes.map((scope) => (
        <TabContent
          key={scope}
          label={formatScopeLabel(scope)}
          description={scope}
        >
          <div
            className={twMerge(
              "-mt-2 rounded-md border border-gray-300 bg-gray-50 p-3 font-mono text-sm",
              className,
            )}
          >
            <JsonViewer data={state[scope] as object} />
          </div>
        </TabContent>
      ))}
    </Tabs>
  );
}
