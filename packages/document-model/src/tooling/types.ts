import type { DefinitionSource } from "@powerhousedao/shared/clis";
import type {
  DefinitionDiagnosticV1,
  DefinitionSourceV1,
  DocumentModelDefinitionV1,
  ScalarDefinitionV1,
  SubgraphDefinitionV1,
} from "@powerhousedao/shared/document-model";

export type DefinitionSourceOrigin = "config" | "cli" | "request";

export type DefinitionSourceSet = {
  readonly mode: "code-first" | "legacy";
  readonly origin: DefinitionSourceOrigin;
  readonly digest: `sha256:${string}`;
  readonly sources: readonly DefinitionSource[];
};

export type DefinitionSourceDiagnostic = {
  readonly code: `PH-${string}`;
  readonly severity: "error" | "warning";
  readonly phase: DefinitionDiagnosticV1["phase"];
  readonly source?: DefinitionSource;
  readonly definition?: DefinitionDiagnosticV1["definition"];
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly expected?: string;
  readonly received?: string;
  readonly repair: string;
  readonly related?: readonly {
    readonly source: DefinitionSource;
    readonly path: readonly (string | number)[];
    readonly message: string;
  }[];
};

export interface TypeScriptSourceImportInterface {
  importModule(request: {
    packageRoot: string;
    specifier: `./${string}`;
    packageRevision: `sha256:${string}`;
    signal?: AbortSignal;
  }): Promise<Readonly<Record<string, unknown>>>;
}

export type DefinitionSourceSelectionRequest = {
  readonly configFile?: string;
  readonly cliSources?: readonly string[];
};

export type DefinitionSourceLoadRequest = DefinitionSourceSelectionRequest & {
  readonly packageRevision: `sha256:${string}`;
  readonly signal?: AbortSignal;
};

export type DefinitionSourceResolution = {
  readonly status: "ready" | "failed" | "skipped";
  readonly sourceSet: DefinitionSourceSet;
  readonly diagnostics: readonly DefinitionSourceDiagnostic[];
};

export type LoadedDefinitionSource = {
  readonly source: DefinitionSource;
  readonly value: unknown;
};

export type DefinitionSourceLoadResult = DefinitionSourceResolution & {
  readonly values: readonly LoadedDefinitionSource[];
};

export type DefinitionCheckProfile = "edit" | "release";

export type DefinitionCheckEntry = {
  readonly kind: "document-model" | "subgraph" | "scalar" | "package";
  readonly key: string;
  readonly version?: number;
  readonly digest?: `sha256:${string}`;
  readonly source: DefinitionSource;
};

export type DefinitionCheckReport = {
  readonly kind: "powerhouse.definition-check";
  readonly formatVersion: 1;
  readonly profile: DefinitionCheckProfile;
  readonly sourceSet: DefinitionSourceSet;
  readonly definitions: readonly DefinitionCheckEntry[];
  readonly diagnostics: readonly DefinitionDiagnosticV1[];
  readonly summary: { readonly errors: number; readonly warnings: number };
} & (
  | {
      readonly status: "ok" | "invalid" | "failed";
      readonly skipReason?: never;
    }
  | {
      readonly status: "skipped";
      readonly skipReason: "explicit-legacy-mode";
    }
);

export type LoadedDefinitionCheckRequest = {
  readonly formatVersion: 1;
  readonly profile: DefinitionCheckProfile;
  readonly warningsAsErrors?: boolean;
  readonly loadResult: DefinitionSourceLoadResult;
};

export type NormalizedDefinitionArtifact =
  | {
      readonly kind: "document-model";
      readonly key: string;
      readonly version: number;
      readonly digest: `sha256:${string}`;
      readonly source: DefinitionSource;
      readonly definition: DocumentModelDefinitionV1;
    }
  | {
      readonly kind: "subgraph";
      readonly key: string;
      readonly digest: `sha256:${string}`;
      readonly source: DefinitionSource;
      readonly definition: SubgraphDefinitionV1;
    }
  | {
      readonly kind: "scalar";
      readonly key: string;
      readonly digest: `sha256:${string}`;
      readonly source: DefinitionSource;
      readonly definition: ScalarDefinitionV1;
    };

export type DefinitionNormalizationResult = {
  readonly report: DefinitionCheckReport;
  readonly artifacts: readonly NormalizedDefinitionArtifact[];
};

export type DefinitionInspectionSelection =
  | {
      readonly kind: "document-model";
      readonly key: string;
      readonly version: number;
    }
  | { readonly kind: "subgraph"; readonly key: string };

export type LoadedDefinitionInspectionRequest = LoadedDefinitionCheckRequest & {
  readonly compilerVersion: string;
  readonly selection: DefinitionInspectionSelection;
};

export type DefinitionInspectionReport = {
  readonly kind: "powerhouse.definition-inspection";
  readonly formatVersion: 1;
  readonly compilerVersion: string;
  readonly selection: DefinitionInspectionSelection;
  readonly sourceSet: DefinitionSourceSet;
  readonly diagnostics: readonly DefinitionDiagnosticV1[];
} & (
  | {
      readonly status: "ok";
      readonly source: DefinitionSourceV1;
      readonly digest: `sha256:${string}`;
      readonly definition: DocumentModelDefinitionV1 | SubgraphDefinitionV1;
    }
  | {
      readonly status: "invalid" | "failed" | "skipped";
    }
);

export type ScalarInspectionReport = {
  readonly kind: "powerhouse.scalar-inspection";
  readonly formatVersion: 1;
  readonly compilerVersion: string;
  readonly selection: { readonly kind: "scalar"; readonly key: string };
  readonly diagnostics: readonly DefinitionDiagnosticV1[];
} & (
  | {
      readonly status: "ok";
      readonly source: DefinitionSourceV1;
      readonly digest: `sha256:${string}`;
      readonly definition: ScalarDefinitionV1;
      readonly coercionSource: "derived" | "explicit";
    }
  | { readonly status: "invalid" }
);
