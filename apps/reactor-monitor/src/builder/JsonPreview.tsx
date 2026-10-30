import type { HostExport } from "@powerhousedao/host-core/schema";
import { useState } from "react";
import type { HostEnv } from "../host-rules/index.js";
import { hostFiles } from "../lib/host-files.js";

/** The one place the builder shows raw config. */
export function JsonPreview({
  envelope,
  env,
}: {
  readonly envelope: HostExport;
  readonly env: HostEnv;
}) {
  const files = [
    {
      path: `${envelope.name}.host-export.json`,
      content: JSON.stringify(envelope, null, 2),
    },
    ...hostFiles(envelope),
    ...(Object.keys(env).length > 0
      ? [{ path: "Environment", content: JSON.stringify(env, null, 2) }]
      : []),
  ];
  const [chosen, setChosen] = useState(files[0].path);
  const file = files.find((candidate) => candidate.path === chosen) ?? files[0];
  return (
    <details className="hb-card hb-preview">
      <summary>What gets saved</summary>
      <div className="hb-opts hb-hscroll">
        {files.map((candidate) => (
          <button
            aria-pressed={candidate.path === file.path}
            className="hb-opt hb-mono"
            key={candidate.path}
            onClick={() => setChosen(candidate.path)}
            type="button"
          >
            {candidate.path}
          </button>
        ))}
      </div>
      <pre className="hb-code hb-mono">{file.content}</pre>
    </details>
  );
}
