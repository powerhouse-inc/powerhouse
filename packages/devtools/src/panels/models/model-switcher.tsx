import { ChevronDown } from "lucide-react";
import type { ProjectDocumentModel } from "../../api.js";
import { Mono } from "../../components/text.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu.js";
import { Switcher } from "../../components/switcher.js";

/** The model's name as a button that opens a searchable list of the
 * project's models: name first, document type below, so long ones wrap. */
export function ModelSwitcher({
  models,
  selected,
  onSelect,
}: {
  models: readonly ProjectDocumentModel[];
  selected: ProjectDocumentModel;
  onSelect: (documentType: string) => void;
}) {
  return (
    <Switcher
      items={models}
      selected={selected}
      itemKey={(model) => model.folder}
      name={(model) => model.name}
      searchText={(model) => [model.name, model.documentType]}
      onSelect={(model) => onSelect(model.documentType)}
      tooltip="Switch document model"
      searchLabel="Find a document model"
      noMatch="No document model matches."
      testId="ph-model"
      itemData={(model) => ({ "data-document-type": model.documentType })}
      renderItem={(model) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium break-words">{model.name}</span>
          <Mono className="text-[11.5px] break-all text-muted-foreground">
            {model.documentType}
          </Mono>
        </span>
      )}
    />
  );
}

/** The version chip, as a menu: for a model with several specifications. */
export function VersionSwitcher({
  versions,
  selected,
  onSelect,
}: {
  versions: readonly number[];
  selected: number;
  onSelect: (version: number) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            data-testid="ph-model-version-switcher"
            aria-label={`Version ${selected}, switch`}
            title="Switch version"
            className="inline-flex h-5 flex-none cursor-pointer items-center gap-0.5 rounded bg-foreground/[0.06] pr-1 pl-1.5 text-[11px] text-muted-foreground hover:text-foreground aria-expanded:text-foreground"
          >
            v{selected}
            <ChevronDown className="size-3" />
          </button>
        }
      />
      <DropdownMenuContent className="w-28" align="start">
        <DropdownMenuRadioGroup
          value={String(selected)}
          onValueChange={(value) => onSelect(Number(value))}
        >
          {versions.map((version) => (
            <DropdownMenuRadioItem
              key={version}
              value={String(version)}
              closeOnClick
              data-testid="ph-model-version-option"
              data-version={String(version)}
              className="text-xs"
            >
              v{version}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
