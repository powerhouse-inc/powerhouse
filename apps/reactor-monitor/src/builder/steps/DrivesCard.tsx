import { useState } from "react";
import {
  addDriveStatus,
  connectReach,
  type HostDraft,
  type HostRulesContext,
  type Member,
  type OptionStatus,
} from "../../host-rules/index.js";
import { DRIVES_COPY, GROUP_LABELS } from "../copy.js";
import { OptionGroup } from "../OptionGroup.js";

/** A named drive for one switchboard; the engine judges each name. */
function AddDrive({
  draft,
  context,
  switchboard,
  onChoose,
}: {
  readonly draft: HostDraft;
  readonly context: HostRulesContext;
  readonly switchboard: { path: string; key: string };
  readonly onChoose: (option: OptionStatus) => void;
}) {
  const [name, setName] = useState("");
  const status = addDriveStatus(draft, context, switchboard.path, name);
  if (!status) return null;
  const add = () => {
    if (!status.enabled) return;
    onChoose(status);
    setName("");
  };
  return (
    <div className="hb-field">
      <span className="hb-flabel">{DRIVES_COPY.addDrive(switchboard.key)}</span>
      <div className="hb-row">
        <input
          aria-label={`${DRIVES_COPY.driveName} for ${switchboard.key}`}
          className="hb-grow"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
          }}
          placeholder={DRIVES_COPY.driveName}
          type="text"
          value={name}
        />
        <button
          className="hb-opt"
          disabled={!status.enabled}
          onClick={add}
          type="button"
        >
          {DRIVES_COPY.addButton}
        </button>
      </div>
      {status.reason && name.trim() !== "" ? (
        <p className="hb-why">{status.reason}</p>
      ) : null}
    </div>
  );
}

/** A Connect's drives: in this browser, or on a switchboard of this host. */
export function DrivesCard({
  draft,
  context,
  member,
  members,
  options,
  onChoose,
}: {
  readonly draft: HostDraft;
  readonly context: HostRulesContext;
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
  const newDrives = own.filter((option) => option.group === "newDrives");
  const adds = own.filter(
    (option) =>
      option.group === "reach" &&
      (option.value === "local" || option.value === "open"),
  );
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
      {newDrives.length > 0 ? (
        <OptionGroup
          hint={DRIVES_COPY.newDrivesHint}
          onChoose={onChoose}
          options={newDrives}
          title={GROUP_LABELS.newDrives}
        />
      ) : reach.keepsCopy ? (
        <p className="hb-note">{DRIVES_COPY.newDrives}</p>
      ) : null}
      {reach.links.length > 0 ? (
        <p className="hb-note">{DRIVES_COPY.moveLater}</p>
      ) : null}
      <OptionGroup
        action
        onChoose={onChoose}
        options={adds}
        title={DRIVES_COPY.add}
      />
      {reach.switchboards.map((switchboard) => (
        <AddDrive
          context={context}
          draft={draft}
          key={switchboard.path}
          onChoose={onChoose}
          switchboard={switchboard}
        />
      ))}
    </div>
  );
}
