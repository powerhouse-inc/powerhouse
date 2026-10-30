import {
  routerSettings,
  type Member,
  type OptionStatus,
} from "../../host-rules/index.js";
import { CONNECTION_COPY, GROUP_LABELS } from "../copy.js";
import { OptionGroup } from "../OptionGroup.js";

/** How a Connect reaches each switchboard, and how its router finds documents. */
export function ConnectionCard({
  member,
  members,
  options,
  onChoose,
}: {
  readonly member: Member;
  readonly members: readonly Member[];
  /** Every option of the draft; the card picks its own. */
  readonly options: readonly OptionStatus[];
  readonly onChoose: (option: OptionStatus) => void;
}) {
  const own = options.filter((option) => option.member === member.path);
  const of = (group: OptionStatus["group"], backend?: string) =>
    own.filter(
      (option) =>
        option.group === group &&
        (backend === undefined || option.backend === backend),
    );
  if (of("probeTimeout").length === 0) return null;
  const { connections } = routerSettings(member, members);
  return (
    <>
      {connections.map((connection) => {
        const at = member.backends.find(
          (backend) => backend.name === connection.backend,
        )?.at;
        const title = CONNECTION_COPY.title(connection.switchboard);
        return (
          <div
            aria-label={title}
            className="hb-sub"
            key={connection.backend}
            role="region"
          >
            <div className="hb-flabel">{title}</div>
            {(["requestTimeout", "breaker", "realtime"] as const).map(
              (group) => (
                <OptionGroup
                  key={group}
                  onChoose={onChoose}
                  options={of(group, at)}
                  title={GROUP_LABELS[group]}
                />
              ),
            )}
          </div>
        );
      })}
      <div
        aria-label={CONNECTION_COPY.finding}
        className="hb-sub"
        role="region"
      >
        <div className="hb-flabel">{CONNECTION_COPY.finding}</div>
        <OptionGroup
          hint={CONNECTION_COPY.probeHint}
          onChoose={onChoose}
          options={of("probeTimeout")}
          title={GROUP_LABELS.probeTimeout}
        />
        <OptionGroup
          hint={CONNECTION_COPY.provisionalHint}
          onChoose={onChoose}
          options={of("provisionalRoute")}
          title={GROUP_LABELS.provisionalRoute}
        />
      </div>
    </>
  );
}
