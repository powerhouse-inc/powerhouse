import type {
  DefinitionDiagnostic,
  PowerhouseScalarName,
  ScalarDefinition,
  ScalarValidationProfile,
  Sha256Digest,
} from "@powerhousedao/shared/document-model";
import type { z } from "zod";
import type { FieldOptions, Nullable, ScalarDescriptor } from "../types.js";
import type {
  ResolvedScalarDeclaration,
  ScalarCoercion,
} from "./declaration.js";

/**
 * What a factory says when it is used as a field without being called. `TCall`
 * is how its author reaches it: `ph.Money` for a catalog scalar, the exported
 * name for a package scalar.
 */
export type ScalarFactoryRole<TCall extends string> =
  `field-use factory; call it, as ${TCall}({ required: true })`;

export type ScalarBinding = {
  readonly definition: ScalarDefinition;
  readonly validationProfile: ScalarValidationProfile;
  readonly validator: z.ZodType;
  readonly coercion: ScalarCoercion<unknown>;
  readonly typescriptType: string;
  readonly zodSource: string;
  readonly typedef: `scalar ${string}`;
};

/** Makes one field use of a scalar. */
export type ScalarFieldFactory<TBase, TInput = TBase> = <
  const TRequired extends boolean = false,
>(
  options?: FieldOptions<TRequired>,
) => ScalarDescriptor<
  Nullable<TInput, TRequired>,
  Nullable<TBase, TRequired>,
  Nullable<TInput, TRequired>,
  TRequired
>;

/**
 * A compiled scalar. Calling it makes a field use, as `ph.PHID()` does; the
 * properties are what the catalog, the compiler, and the host read.
 */
export type ScalarFactory<
  TName extends string = string,
  TBuilderName extends string = string,
  TBase = unknown,
  TCall extends string = TBuilderName,
  TInput = TBase,
> = ScalarFieldFactory<TBase, TInput> & {
  readonly role: ScalarFactoryRole<TCall>;
  readonly kind: "scalar-factory";
  /** The declaration as written, with every default filled in. */
  readonly declaration: ResolvedScalarDeclaration<
    TName,
    TBuilderName,
    TBase,
    TInput
  >;
  readonly definition: ScalarDefinition & { readonly name: TName };
  readonly binding: ScalarBinding;
};

/** The factory `ph` exposes for a catalog scalar. */
export type PhScalarFactory<TScalar> =
  TScalar extends ScalarFactory<
    infer TName,
    infer TBuilderName,
    infer TBase,
    string,
    infer TInput
  >
    ? ScalarFactory<TName, TBuilderName, TBase, `ph.${TBuilderName}`, TInput>
    : never;

export interface ScalarCatalogInterface<
  TName extends string = PowerhouseScalarName,
> {
  resolve(
    name: string,
    validationProfile: ScalarValidationProfile,
  ): ScalarBinding | undefined;
  readonly names: readonly TName[];
  readonly validationProfiles: readonly ScalarValidationProfile[];
  readonly digest: Sha256Digest;
}

export type ScalarCatalogReport = {
  readonly kind: "powerhouse.scalar-catalog";
  readonly formatVersion: 1;
  readonly catalogDigest: Sha256Digest;
  readonly entries: readonly {
    readonly name: string;
    readonly validationProfile: ScalarValidationProfile;
    readonly definitionDigest: Sha256Digest;
    readonly coercionSource: "derived" | "explicit";
  }[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

export type ScalarCatalogBuildResult<TName extends string = string> =
  | {
      readonly catalog: ScalarCatalogInterface<TName>;
      readonly report: ScalarCatalogReport;
    }
  | { readonly catalog?: undefined; readonly report: ScalarCatalogReport };
