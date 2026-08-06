import { Modal } from "@powerhousedao/design-system";
import { ModalButton } from "@powerhousedao/design-system/connect";
import type { VersionAdvisoryPrompt } from "../hooks/useVersionAdvisory.js";

const compactButtonStyle =
  "min-h-0 min-w-0 flex-none rounded-lg px-4 py-1.5 text-sm whitespace-nowrap";

function FieldDiffList(props: { label: string; fields: string[] }) {
  const { label, fields } = props;
  if (fields.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5">{label}</p>
      <div className="flex flex-col items-start gap-1">
        {fields.map((field) => (
          <span
            className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground"
            key={field}
          >
            {field}
          </span>
        ))}
      </div>
    </div>
  );
}

type VersionAdvisoryModalProps = {
  prompt: VersionAdvisoryPrompt | undefined;
  onReleaseFirst: () => void;
  onKeepEditing: () => void;
  onCancel: () => void;
};

export function VersionAdvisoryModal(props: VersionAdvisoryModalProps) {
  const { prompt, onReleaseFirst, onKeepEditing, onCancel } = props;
  if (!prompt) return null;
  const { version, reason, diff } = prompt;
  const nextVersion = version + 1;

  return (
    <Modal
      open
      onOpenChange={(status: boolean) => {
        if (!status) onCancel();
      }}
    >
      <div className="w-[440px] p-6" data-testid="version-advisory-modal">
        <div className="pb-2 text-2xl font-bold text-foreground">
          Is version {version} of this model already in use?
        </div>
        <div className="my-4 rounded-md bg-background p-4 text-left text-sm text-foreground">
          <p>
            {reason} Documents that were already created with version {version}{" "}
            may stop working correctly.
          </p>
          {diff && (
            <>
              <FieldDiffList fields={diff.addedFields} label="New fields:" />
              <FieldDiffList
                fields={diff.removedFields}
                label="Removed fields:"
              />
              <FieldDiffList
                fields={diff.changedFields}
                label="Changed fields:"
              />
            </>
          )}
          <p className="mt-3">
            If others are already using version {version}, release version{" "}
            {nextVersion} first. Your change will go into version {nextVersion},
            and existing documents can be updated safely.
          </p>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <ModalButton
            className={compactButtonStyle}
            data-testid="advisory-release-first"
            onClick={onReleaseFirst}
            variant="confirm"
          >
            {`It's in use — release v${nextVersion} first`}
          </ModalButton>
          <ModalButton
            className={compactButtonStyle}
            data-testid="advisory-keep-editing"
            onClick={onKeepEditing}
            variant="cancel"
          >
            Still in development — keep editing v{version}
          </ModalButton>
        </div>
      </div>
    </Modal>
  );
}
