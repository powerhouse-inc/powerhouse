import { PackageAnimation } from "#design-system";
import type {
  SearchAutocompleteOption,
  SearchAutocompleteRowContext,
} from "#design-system/ui";
import { SearchAutocomplete } from "#design-system/ui";
import type { RegistryPackageList } from "@powerhousedao/shared/registry";
import { useCallback, useEffect, useState } from "react";
import { buildPackageSpec, parsePackageSpec } from "./parse-package-spec.js";
import type { VersionSelection } from "./version-picker.js";
import {
  VersionPicker,
  resolveDefaultVersionSelection,
} from "./version-picker.js";

export type PackageManagerInputProps = {
  registryPackageList: RegistryPackageList;
  onInstall: (packageSpec: string) => Promise<void>;
  disabled?: boolean;
  className?: string;
};

const NPM_NAME_RE =
  /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$|^[a-z0-9][a-z0-9._-]*$/i;

function isPlausiblePackageName(name: string): boolean {
  return name.length >= 2 && NPM_NAME_RE.test(name);
}

type PackageResultCardProps = {
  option: SearchAutocompleteOption;
  ctx: SearchAutocompleteRowContext;
  typedTag: string | undefined;
};

function PackageResultCard(props: PackageResultCardProps) {
  const { option, ctx, typedTag } = props;
  const { selectingValue, selectLabel, selectingContent, handleSelect } = ctx;

  const baseName = option.label.split(" @ ")[0] ?? option.value;
  const hasVersionMetadata =
    (option.distTags && Object.keys(option.distTags).length > 0) ||
    (option.versions?.length ?? 0) > 0;

  const [selected, setSelected] = useState<VersionSelection>(() =>
    resolveDefaultVersionSelection({
      distTags: option.distTags,
      versions: option.versions,
      version: option.version,
      preferredTag: typedTag,
    }),
  );

  // Re-sync when the typed tag changes (e.g. user edits the search query).
  // We track `typedTag` so typing `pkg@dev` pre-selects the `dev` chip.
  useEffect(() => {
    if (!typedTag) return;
    if (option.distTags && typedTag in option.distTags) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected({ kind: "tag", value: typedTag });
    } else if (option.versions?.includes(typedTag)) {
      setSelected({ kind: "version", value: typedTag });
    }
  }, [typedTag, option.distTags, option.versions]);

  // npm-fallback and other metadata-less rows: trust the option's prebuilt
  // spec (which already encodes any typed tag) and skip the picker entirely.
  const installSpec = hasVersionMetadata
    ? buildPackageSpec(baseName, selected.value)
    : option.value;
  const isSelecting = selectingValue === installSpec;
  const isDisabled = option.disabled === true;

  return (
    <div className="flex items-start justify-between gap-3 rounded-md p-2 hover:bg-gray-50">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{baseName}</p>
        {option.description && (
          <p className="truncate text-xs text-gray-500">{option.description}</p>
        )}
        {option.meta && (
          <p className="truncate text-xs text-gray-400">{option.meta}</p>
        )}
        {hasVersionMetadata && (
          <div className="mt-2">
            <VersionPicker
              distTags={option.distTags}
              versions={option.versions}
              selected={selected}
              onChange={setSelected}
              disabled={isDisabled}
            />
          </div>
        )}
      </div>
      <div className="shrink-0 self-center">
        {isSelecting && selectingContent ? (
          <div className="flex items-center justify-center">
            {selectingContent}
          </div>
        ) : isDisabled ? (
          <span className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
            {option.disabledLabel ?? "Unavailable"}
          </span>
        ) : (
          <button
            onClick={() => handleSelect(installSpec)}
            disabled={isSelecting}
            className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {isSelecting ? "..." : selectLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export const PackageManagerInput: React.FC<PackageManagerInputProps> = (
  props,
) => {
  const { registryPackageList, onInstall, disabled, className } = props;
  const [typedTag, setTypedTag] = useState<string | undefined>(undefined);

  const fetchOptions = async (
    query: string,
  ): Promise<SearchAutocompleteOption[]> => {
    const { name: namePart, tag } = parsePackageSpec(query);
    setTypedTag(tag);
    const needle = namePart.toLowerCase();

    const localOptions: SearchAutocompleteOption[] = registryPackageList
      .filter(
        (pkg) =>
          pkg.name.toLowerCase().includes(needle) ||
          pkg.manifest?.description?.toLowerCase().includes(needle),
      )
      .map((pkg) => {
        const isInstalled =
          pkg.status === "local-install" || pkg.status === "registry-install";
        return {
          // `value` carries the default install spec; the row overrides it
          // with the version picker's current selection at click time.
          value: pkg.name,
          label: pkg.name,
          version: pkg.version,
          description: pkg.manifest?.description,
          meta: pkg.manifest?.publisher?.name,
          disabled: isInstalled,
          disabledLabel: isInstalled ? "Installed" : undefined,
          distTags: pkg.distTags,
          versions: pkg.versions,
        };
      });

    if (!isPlausiblePackageName(namePart) || localOptions.length > 0) {
      return Promise.resolve(localOptions);
    }

    const fallbackSpec = buildPackageSpec(namePart, tag);
    const fallbackLabel = tag ? `${namePart} @ ${tag}` : namePart;
    const fallbackOption: SearchAutocompleteOption = {
      value: fallbackSpec,
      label: fallbackLabel,
      version: tag,
      description:
        "Not published to this registry. Install via the npmjs.org uplink.",
      meta: "npm fallback",
    };
    return Promise.resolve([fallbackOption]);
  };

  const handleSelect = useCallback(
    (value: string) => {
      return onInstall(value);
    },
    [onInstall],
  );

  const renderRow = useCallback(
    (option: SearchAutocompleteOption, ctx: SearchAutocompleteRowContext) => (
      <PackageResultCard option={option} ctx={ctx} typedTag={typedTag} />
    ),
    [typedTag],
  );

  return (
    <div className={className}>
      <h3 className="mb-4 font-semibold text-gray-900">Install Package</h3>
      <SearchAutocomplete
        fetchOptions={fetchOptions}
        onSelect={handleSelect}
        selectLabel="Install"
        selectingContent={
          <PackageAnimation animate loop color="#6b7280" size={48} />
        }
        placeholder="Search packages (e.g. my-pkg, my-pkg@dev, my-pkg@1.2.3)..."
        disabled={disabled}
        renderRow={renderRow}
        keepOpenSelector="[data-version-picker],[data-version-picker-trigger]"
      />
    </div>
  );
};
