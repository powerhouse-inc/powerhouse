import { POWERHOUSE_CONFIG_FILE } from "@powerhousedao/shared/clis/constants";
import {
  type DefinitionSourceSelectionRequest,
  resolveDefinitionSelection,
} from "document-model/tooling";
import { dirname, resolve } from "node:path";
import type { DefinitionSelectionArgs } from "../../types.js";

export function selectedConfigFile(
  args: DefinitionSelectionArgs,
  fallbackRoot: string = process.cwd(),
): string {
  return args.configFile === undefined
    ? resolve(fallbackRoot, POWERHOUSE_CONFIG_FILE)
    : resolve(args.configFile);
}

export function selectedPackageRoot(
  args: DefinitionSelectionArgs,
  fallbackRoot: string = process.cwd(),
): string {
  return args.configFile === undefined
    ? fallbackRoot
    : dirname(selectedConfigFile(args));
}

export function selectedCliSources(
  args: DefinitionSelectionArgs,
): readonly string[] | undefined {
  return args.source.length > 0 ? args.source : undefined;
}

export function selectionRequest(
  args: DefinitionSelectionArgs,
  fallbackRoot: string = process.cwd(),
): DefinitionSourceSelectionRequest {
  const cliSources = selectedCliSources(args);
  return {
    configFile: selectedConfigFile(args, fallbackRoot),
    ...(cliSources !== undefined && { cliSources }),
  };
}

export function selectedSourceSetDigest(
  args: DefinitionSelectionArgs,
  fallbackRoot: string = process.cwd(),
): string {
  return resolveDefinitionSelection(selectionRequest(args, fallbackRoot))
    .sourceSet.digest;
}
