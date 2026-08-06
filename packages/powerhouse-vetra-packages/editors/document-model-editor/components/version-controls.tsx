import { Modal } from "@powerhousedao/design-system";
import {
  ConnectSelect,
  ModalButton,
} from "@powerhousedao/design-system/connect";
import type { DocumentSpecification } from "@powerhousedao/shared/document-model";
import { useState } from "react";
import { Button } from "./button.js";

const compactButtonStyle =
  "min-h-0 min-w-0 flex-none rounded-lg px-6 py-1.5 text-sm whitespace-nowrap";

type VersionControlsProps = {
  specifications: DocumentSpecification[];
  viewedVersion: number;
  onViewVersion: (version: number | "latest") => void;
  onReleaseNewVersion: () => void;
};

export function VersionControls(props: VersionControlsProps) {
  const { specifications, viewedVersion, onViewVersion, onReleaseNewVersion } =
    props;
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const latestVersion = specifications[specifications.length - 1].version;
  const nextVersion = latestVersion + 1;

  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <span
          className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground"
          data-testid="model-version-badge"
        >
          Version {viewedVersion}
        </span>
        {specifications.length >= 2 && (
          <div
            aria-label="Document model version"
            data-testid="model-version-switcher"
          >
            <ConnectSelect
              absolutePositionMenu
              containerClassName="z-10"
              id="model-version-switcher"
              itemClassName="gap-1 px-2 py-1.5"
              items={specifications.map((spec) => ({
                value: String(spec.version),
                displayValue: (
                  <span className="font-mono text-xs normal-case">
                    {spec.version === latestVersion
                      ? `v${spec.version} (latest)`
                      : `v${spec.version} (frozen)`}
                  </span>
                ),
              }))}
              listClassName="border border-t-0 border-border shadow-md"
              menuClassName="min-w-0"
              onChange={(value) => {
                const version = Number(value);
                onViewVersion(version === latestVersion ? "latest" : version);
              }}
              value={String(viewedVersion)}
            />
          </div>
        )}
      </div>
      <Button
        className="inline-flex h-8 items-center justify-center py-0"
        data-testid="release-new-version-button"
        onClick={() => setShowReleaseModal(true)}
        type="button"
      >
        Release new version
      </Button>
      <Modal
        open={showReleaseModal}
        onOpenChange={(status: boolean) => {
          if (!status) setShowReleaseModal(false);
        }}
      >
        <div className="w-[440px] p-6">
          <div className="pb-2 text-2xl font-bold text-foreground">
            Release version {nextVersion}
          </div>
          <div className="my-4 rounded-md bg-background p-4 text-left text-sm text-foreground">
            <p>
              Version {latestVersion} will be frozen as-is. Version{" "}
              {nextVersion} starts as an identical copy, and all further edits
              apply to version {nextVersion}.
            </p>
            <p className="mt-3">
              Existing version {latestVersion} documents will be upgradeable
              once you define the migration.
            </p>
          </div>
          <div className="mt-4 flex justify-between gap-3">
            <ModalButton
              className={compactButtonStyle}
              onClick={() => setShowReleaseModal(false)}
              variant="cancel"
            >
              Cancel
            </ModalButton>
            <ModalButton
              className={compactButtonStyle}
              data-testid="confirm-release-button"
              onClick={() => {
                setShowReleaseModal(false);
                onReleaseNewVersion();
              }}
              variant="confirm"
            >
              Release version {nextVersion}
            </ModalButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function FrozenVersionBanner(props: {
  viewedVersion: number;
  latestVersion: number;
}) {
  const { viewedVersion, latestVersion } = props;
  return (
    <div
      className="mb-4 rounded-md border border-border bg-muted p-3 text-sm text-foreground"
      data-testid="frozen-version-banner"
    >
      Version {viewedVersion} is frozen. You&apos;re viewing it read-only. Edits
      go to version {latestVersion}.
    </div>
  );
}
