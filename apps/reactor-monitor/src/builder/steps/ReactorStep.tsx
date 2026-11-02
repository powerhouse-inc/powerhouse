import { useState } from "react";
import type {
  Member,
  OptionGroup as Group,
  OptionStatus,
} from "../../host-rules/index.js";
import { GROUP_LABELS, ROLE_LABELS } from "../copy.js";
import { IssueList } from "../IssueList.js";
import { OptionGroup } from "../OptionGroup.js";
import { memberOf, stepOf } from "../engine.js";
import { ConnectionCard } from "./ConnectionCard.js";
import { DrivesCard } from "./DrivesCard.js";
import type { StepProps } from "./types.js";

const MEMBER_GROUPS: Group[] = ["hotReload", "workers", "projectionWorker"];

function BackendOptions({
  member,
  options,
  onChoose,
}: {
  readonly member: Member;
  readonly options: readonly OptionStatus[];
  readonly onChoose: (option: OptionStatus) => void;
}) {
  const sites = [...new Set(options.flatMap((option) => option.backend ?? []))];
  return sites.map((at) => {
    const backend = member.backends.find((candidate) => candidate.at === at);
    const own = options.filter((option) => option.backend === at);
    const title =
      backend?.mode === "browser"
        ? `Reactor in the browser: ${backend.name}`
        : undefined;
    const groups = (["storage", "backendKind"] as const).map((group) => (
      <OptionGroup
        key={group}
        onChoose={onChoose}
        options={own.filter((option) => option.group === group)}
        title={GROUP_LABELS[group]}
      />
    ));
    return title ? (
      <div className="hb-sub" key={at}>
        <div className="hb-flabel">{title}</div>
        {groups}
      </div>
    ) : (
      <div className="hb-sub" key={at}>
        {groups}
      </div>
    );
  });
}

export function ReactorStep({ draft, engine, onChoose }: StepProps) {
  const { members } = engine;
  const [chosen, setChosen] = useState(members.at(0)?.path);
  const member =
    members.find((candidate) => candidate.path === chosen) ?? members.at(0);
  const access = engine.options.filter((option) => option.group === "access");
  const own = member
    ? engine.options.filter((option) => option.member === member.path)
    : [];
  const issues = engine.issues.filter(
    (issue) =>
      stepOf(issue.path) === "reactor" &&
      memberOf(members, issue.path) === member,
  );
  const elsewhere = engine.issues.filter(
    (issue) =>
      stepOf(issue.path) === "reactor" &&
      memberOf(members, issue.path) === undefined,
  );
  return (
    <section className="hb-step">
      <h2 className="hb-h2">Configure each reactor</h2>
      <p className="hb-note">
        Choices that would make a host that can't start are turned off, with the
        reason underneath.
      </p>
      <div className="hb-card hb-sec">
        <OptionGroup
          hint="Applies to every reactor in this host."
          onChoose={onChoose}
          options={access}
          title={GROUP_LABELS.access}
        />
      </div>
      <IssueList issues={elsewhere} />
      {members.length > 1 ? (
        <div
          aria-label="Reactors"
          className="hb-opts hb-hscroll"
          role="tablist"
        >
          {members.map((candidate) => (
            <button
              aria-selected={candidate === member}
              className="hb-mtab"
              key={candidate.path}
              onClick={() => setChosen(candidate.path)}
              role="tab"
              type="button"
            >
              {candidate.key}
              <span className="hb-note">{ROLE_LABELS[candidate.role]}</span>
            </button>
          ))}
        </div>
      ) : null}
      {member ? (
        <div className="hb-card hb-sec" role="tabpanel">
          <div className="hb-flabel">
            {member.key} · {ROLE_LABELS[member.role]}
          </div>
          {member.role === "connect" ? (
            <>
              <DrivesCard
                context={engine.context}
                draft={{ envelope: engine.envelope, env: draft.env }}
                member={member}
                members={members}
                onChoose={onChoose}
                options={engine.options}
              />
              <ConnectionCard
                member={member}
                members={members}
                onChoose={onChoose}
                options={engine.options}
              />
            </>
          ) : (
            <BackendOptions
              member={member}
              onChoose={onChoose}
              options={own.filter(
                (option) =>
                  option.group === "storage" || option.group === "backendKind",
              )}
            />
          )}
          {MEMBER_GROUPS.map((group) => (
            <OptionGroup
              key={group}
              onChoose={onChoose}
              options={own.filter((option) => option.group === group)}
              title={GROUP_LABELS[group]}
            />
          ))}
          {own.length === 0 ? (
            <p className="hb-note">Nothing to set for this reactor here.</p>
          ) : null}
          <IssueList issues={issues} />
        </div>
      ) : (
        <p className="hb-note">This host runs no reactors yet.</p>
      )}
    </section>
  );
}
