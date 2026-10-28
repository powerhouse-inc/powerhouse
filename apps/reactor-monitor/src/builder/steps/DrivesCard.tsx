import {
  connectReach,
  type Member,
  type OptionStatus,
} from "../../host-rules/index.js";
import { DRIVES_COPY, GROUP_LABELS } from "../copy.js";
import { OptionGroup } from "../OptionGroup.js";

/** A Connect's drives: in this browser, or on a switchboard of this host. */
export function DrivesCard({
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
  const reach = connectReach(member, members);
  const own = options.filter((option) => option.member === member.path);
  const removeOf = (id: string) =>
    own.filter((option) => option.id === `${member.path}:reach:${id}`);
  const adds = [
    ...own.filter(
      (option) =>
        option.group === "reach" &&
        (option.value === "local" || option.value === "open"),
    ),
    ...options.filter(
      (option) => option.group === "reach" && option.value === "addDrive",
    ),
  ];
  const keepsCopy = reach.local.length > 0 || reach.implicitLocal;
  return (
    <div aria-label={GROUP_LABELS.reach} className="hb-sub" role="region">
      <div className="hb-flabel">{GROUP_LABELS.reach}</div>
      {reach.implicitLocal ? (
        <div className="hb-field">
          <div className="hb-flabel">{DRIVES_COPY.inBrowser}</div>
          <p className="hb-note">{DRIVES_COPY.defaultReactor}</p>
        </div>
      ) : null}
      {reach.local.map((backend) => {
        const at = own.filter((option) => option.backend === backend.at);
        return (
          <div
            aria-label={DRIVES_COPY.inBrowser}
            className="hb-sub"
            key={backend.at}
            role="group"
          >
            <OptionGroup
              actions={removeOf(`remove:${backend.name}`)}
              onChoose={onChoose}
              options={at.filter((option) => option.group === "storage")}
              title={`${DRIVES_COPY.inBrowser}: ${GROUP_LABELS.storage}`}
            />
            <OptionGroup
              onChoose={onChoose}
              options={at.filter((option) => option.group === "backendKind")}
              title={GROUP_LABELS.backendKind}
            />
          </div>
        );
      })}
      {reach.links.map((link) => (
        <OptionGroup
          actions={removeOf(`unlink:${link.slug}`)}
          key={link.at}
          onChoose={onChoose}
          options={own.filter(
            (option) =>
              option.group === "placement" && option.drive === link.slug,
          )}
          title={DRIVES_COPY.onSwitchboard(link.slug, link.switchboard)}
        />
      ))}
      {reach.notes.map((note) => (
        <p className="hb-note" key={note}>
          {note}
        </p>
      ))}
      {keepsCopy ? <p className="hb-note">{DRIVES_COPY.newDrives}</p> : null}
      {reach.links.length > 0 ? (
        <p className="hb-note">{DRIVES_COPY.moveLater}</p>
      ) : null}
      <OptionGroup
        action
        onChoose={onChoose}
        options={adds}
        title={DRIVES_COPY.add}
      />
    </div>
  );
}
