import type {
  ProjectDocumentModel,
  ProjectDocumentModelDetail,
} from "../../api.js";
import { FileQuestion, FileWarning } from "lucide-react";
import { EmptyState } from "../../components/empty-state.js";
import { Loading } from "../../components/loading.js";
import { PageHeader } from "../../components/page-header.js";
import { Section, Sections } from "../../components/section.js";
import { Tag } from "../../components/status.js";
import { EmptyText, Mono } from "../../components/text.js";
import type { PanelProps } from "../../shell/registry.js";
import { useShell } from "../../shell/state.js";
import { ModelMeta } from "./model-meta.js";
import { ModulesSection } from "./modules-section.js";
import { StateSection } from "./state-section.js";
import { ModelSwitcher, VersionSwitcher } from "./model-switcher.js";
import {
  modelFocus,
  parseModelFocus,
  type ModelSelection,
} from "../../project/focus.js";
import { MODULE_KINDS } from "../../project/kinds.js";
import { ChecksTag } from "../../project/checks.js";
import { legacyOf } from "../../project/legacy.js";
import { LegacyNotice, LegacyTag } from "../../project/legacy-notice.js";
import {
  EmptyKind,
  SectionError,
  StaleNote,
  WithProject,
} from "../../project/with-project.js";
import {
  useDocumentModelDetail,
  type ProjectResource,
} from "../../project/provider.js";

const { panel } = MODULE_KINDS["document-model"];

export function ModelsPage({ focus }: PanelProps) {
  return (
    <div data-testid="ph-models-page" className="min-w-0">
      <WithProject>
        {(snapshot) => {
          const section = snapshot.documentModels;
          if (!section.ok) {
            return (
              <SectionError kind="document-model" message={section.message} />
            );
          }
          const selection = parseModelFocus(
            focus,
            section.items.map((candidate) => candidate.documentType),
          );
          const model =
            section.items.find(
              (candidate) => candidate.documentType === selection?.documentType,
            ) ?? section.items[0];
          if (!model) return <EmptyKind kind="document-model" />;
          return (
            <Model
              key={model.documentType}
              models={section.items}
              model={model}
              selection={selection ?? { documentType: model.documentType }}
            />
          );
        }}
      </WithProject>
    </div>
  );
}

function Model({
  models,
  model,
  selection,
}: {
  models: readonly ProjectDocumentModel[];
  model: ProjectDocumentModel;
  selection: ModelSelection;
}) {
  const { navigate } = useShell();
  const detail = useDocumentModelDetail(model.documentType);

  const legacy = legacyOf({ kind: "document-model", module: model });
  const latest = model.versions.at(-1);
  const version =
    selection.version !== undefined &&
    model.versions.includes(selection.version)
      ? selection.version
      : latest;
  const select = (next: ModelSelection) =>
    navigate({ panel, focus: modelFocus(next) });
  const selectVersion = (next: number) =>
    select({
      documentType: model.documentType,
      ...(next !== latest && { version: next }),
      ...(selection.item !== undefined && { item: selection.item }),
    });
  return (
    <section
      aria-label={`Document model ${model.name}`}
      data-testid="ph-model"
      data-document-type={model.documentType}
      className="grid min-w-0 grid-cols-1 gap-x-6 @4xl/main:grid-cols-[minmax(0,1fr)_15rem]"
    >
      <div className="min-w-0">
        <PageHeader
          title={
            models.length > 1 ? (
              <ModelSwitcher
                models={models}
                selected={model}
                onSelect={(documentType) => select({ documentType })}
              />
            ) : (
              <span data-testid="ph-model-name" className="min-w-0 break-words">
                {model.name}
              </span>
            )
          }
          description={
            model.description && (
              <span data-testid="ph-model-about">{model.description}</span>
            )
          }
        >
          {version !== undefined &&
            (model.versions.length > 1 ? (
              <VersionSwitcher
                versions={model.versions}
                selected={version}
                onSelect={selectVersion}
              />
            ) : (
              <Tag data-testid="ph-model-version">v{version}</Tag>
            ))}
          <ChecksTag checks={model.checks} />
          {legacy && <LegacyTag legacy={legacy} />}
        </PageHeader>
        {legacy && <LegacyNotice legacy={legacy} className="mt-3" />}
      </div>
      <ModelMeta
        model={model}
        className="mt-3 @4xl/main:col-start-2 @4xl/main:row-span-2 @4xl/main:row-start-1 @4xl/main:mt-0"
      />
      <div className="min-w-0 @4xl/main:col-start-1">
        <ModelBody
          model={model}
          detail={detail}
          version={version}
          item={selection.item}
          onSelect={(item) =>
            select({
              documentType: model.documentType,
              ...(version !== latest && { version }),
              item,
            })
          }
        />
      </div>
    </section>
  );
}

function ModelBody({
  model,
  detail,
  version: versionNumber,
  item: itemId,
  onSelect,
}: {
  model: ProjectDocumentModel;
  detail: ProjectResource<ProjectDocumentModelDetail>;
  version: number | undefined;
  item: string | undefined;
  onSelect: (item: string) => void;
}) {
  if (detail.state === "loading") {
    return (
      <div className="mt-5">
        <Loading data-testid="ph-model-loading">
          Reading <Mono>{model.source}</Mono>…
        </Loading>
      </div>
    );
  }
  if (detail.state === "unavailable") {
    return (
      <div className="mt-5">
        <EmptyState
          data-testid="ph-model-error"
          icon={FileWarning}
          tone="error"
          role="alert"
          title={`Could not read ${model.name}`}
          reason={detail.message}
        >
          DevTools reads <Mono>{model.source}</Mono> again when the
          project&apos;s files change.
        </EmptyState>
      </div>
    );
  }
  const { specifications } = detail.data;
  const version =
    specifications.find((candidate) => candidate.version === versionNumber) ??
    specifications.at(-1);
  if (!version) {
    return (
      <div className="mt-5">
        <EmptyState
          data-testid="ph-model-no-specification"
          icon={FileQuestion}
          title="This model has no specification"
        >
          <Mono>{model.source}</Mono> declares no version, so there is no state
          or operation to show.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="mt-5">
      {detail.staleMessage && (
        <StaleNote data-testid="ph-model-stale" message={detail.staleMessage} />
      )}
      <Sections data-testid="ph-model-sections">
        <StateSection
          model={detail.data}
          version={version}
          item={itemId}
          onSelect={onSelect}
        />
        {version.modules.length === 0 ? (
          <Section data-testid="ph-model-no-modules" title="Modules">
            <EmptyText>
              This version declares no modules, so no operations.
            </EmptyText>
          </Section>
        ) : (
          <ModulesSection
            modules={version.modules}
            item={itemId}
            onSelect={onSelect}
          />
        )}
      </Sections>
    </div>
  );
}
