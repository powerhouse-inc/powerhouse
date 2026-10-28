import { GROUP_LABELS, ROLE_LABELS } from "../copy.js";
import { IssueList } from "../IssueList.js";
import { OptionGroup } from "../OptionGroup.js";
import { stepOf } from "../engine.js";
import type { StepProps } from "./types.js";

export function MembersStep({ engine, onChoose }: StepProps) {
  const add = engine.options.filter((option) => option.group === "add");
  const issues = engine.issues.filter(
    (issue) => stepOf(issue.path) === "members",
  );
  return (
    <section className="hb-step">
      <h2 className="hb-h2">Reactors</h2>
      <p className="hb-note">The reactors this host runs.</p>
      <ul className="hb-card hb-members">
        {engine.members.map((member) => (
          <li className="hb-member" key={member.path}>
            <div>
              <b>{member.key}</b> · {ROLE_LABELS[member.role]}
              <span className="hb-fpath hb-mono hb-block">
                hosts/{member.folder}
              </span>
            </div>
            {member.backends
              .filter((backend) => backend.mode === "browser")
              .map((backend) => (
                <div className="hb-note" key={backend.at}>
                  Reactor in the browser: {backend.name}
                </div>
              ))}
          </li>
        ))}
        {engine.members.length === 0 ? (
          <li className="hb-member hb-note">This host runs no reactors yet.</li>
        ) : null}
      </ul>
      <div className="hb-card hb-sec">
        <OptionGroup
          action
          onChoose={onChoose}
          options={add}
          title={GROUP_LABELS.add}
        />
      </div>
      <IssueList issues={issues} />
    </section>
  );
}
