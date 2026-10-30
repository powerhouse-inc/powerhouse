import { useState } from "react";
import { checkSetter } from "../../host-rules/index.js";
import { isRecord } from "../../host-rules/members.js";
import { IssueList } from "../IssueList.js";
import { stepOf } from "../engine.js";
import type { StepProps } from "./types.js";

const NAME_PATH = "host.name";

function hostName(host: unknown): string {
  return isRecord(host) && typeof host.name === "string" ? host.name : "";
}

export function BasicsStep({ draft, engine, onEdit }: StepProps) {
  const current = hostName(engine.envelope.host);
  const [name, setName] = useState(current);
  const [shown, setShown] = useState(current);
  const [refused, setRefused] = useState("");
  // Undo changes the name under the field.
  if (shown !== current) {
    setShown(current);
    setName(current);
  }
  const commit = () => {
    if (name === current) {
      setRefused("");
      return;
    }
    const setter = { path: NAME_PATH, value: name };
    const verdict = checkSetter(setter, engine.envelope);
    if (!verdict.ok) {
      setRefused(verdict.reason);
      return;
    }
    setRefused("");
    onEdit([setter]);
  };
  const host = engine.envelope.host as unknown;
  const compound = isRecord(host) && isRecord(host.children);
  const issues = engine.issues.filter(
    (issue) => stepOf(issue.path) === "basics",
  );
  const { base } = draft;
  return (
    <section className="hb-step">
      <h2 className="hb-h2">Host basics</h2>
      <div className="hb-card hb-sec">
        <div className="hb-field">
          <span className="hb-flabel">Folder</span>
          <span className="hb-mono">hosts/{engine.envelope.name}/</span>
          <span className="hb-note">The folder can't be renamed here.</span>
        </div>
        <label className="hb-field">
          <span className="hb-flabel">Name</span>
          <input
            onBlur={commit}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
            }}
            type="text"
            value={name}
          />
          <span className="hb-note">
            What the running host is called.{" "}
            <span className="hb-mono">{NAME_PATH}</span>
          </span>
        </label>
        {refused ? (
          <p className="hb-why">
            <b>Name:</b> {refused}
          </p>
        ) : null}
        <div className="hb-field">
          <span className="hb-flabel">Reactors</span>
          <span>{compound ? `Several (${engine.members.length})` : "One"}</span>
        </div>
        <div className="hb-field">
          <span className="hb-flabel">Comes from</span>
          {base.kind === "project" ? (
            <span>
              The {base.host} host in{" "}
              <span className="hb-mono">{base.project}</span>
            </span>
          ) : (
            <span>
              An imported export
              {base.fileName ? (
                <>
                  , <span className="hb-mono">{base.fileName}</span>
                </>
              ) : null}
            </span>
          )}
        </div>
      </div>
      <IssueList issues={issues} />
    </section>
  );
}
