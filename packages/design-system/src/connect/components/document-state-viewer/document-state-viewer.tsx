import { TabContent, Tabs } from "@powerhousedao/design-system/connect";
import { JsonViewer } from "@powerhousedao/design-system/ui";
import { useEffect, useMemo, useState } from "react";
import { twMerge } from "tailwind-merge";

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
    () =>
      Object.keys(state).filter((scope) => !ignoredScopes.includes(scope)),
    [state, ignoredScopes],
  );

  const [selectedScope, setSelectedScope] = useState(
    defaultScope || scopes[0] || "global",
  );

  // Auto-select first scope when scopes change or selected scope becomes invalid
  useEffect(() => {
    if (scopes.length > 0 && !scopes.includes(selectedScope)) {
      setSelectedScope(scopes[0]);
    }
  }, [scopes, selectedScope]);

  if (scopes.length === 0) {
    return <div className="text-sm text-gray-500">No state data</div>;
  }

  return (
    <Tabs
      value={formatScopeLabel(selectedScope)}
      onValueChange={(value) => {
        const scope = scopes.find((s) => formatScopeLabel(s) === value);
        if (scope) setSelectedScope(scope);
      }}
    >
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
