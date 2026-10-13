import type {
  CatalogScalarName,
  DefinitionDiagnostic,
  InternalScalarName,
  PowerhouseScalarName,
  ScalarDefinition,
  ScalarValidationProfile,
  Sha256Digest,
} from "@powerhousedao/shared/document-model";
import type { z } from "zod";
import type { ScalarBuilder } from "../types.js";
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
export type ScalarFieldFactory<TBase, TInput = TBase> = ScalarBuilder<
  TBase,
  TInput
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

/**
 * A catalog scalar only the reactor host declares. It has no call signature,
 * so no field can use it; the catalog and the reactor host read its
 * properties.
 */
export type InternalScalar<
  TName extends string = string,
  TBuilderName extends string = string,
  TBase = unknown,
  TInput = TBase,
> = {
  readonly kind: "internal-scalar";
  readonly declaration: ResolvedScalarDeclaration<
    TName,
    TBuilderName,
    TBase,
    TInput
  >;
  readonly definition: ScalarDefinition & { readonly name: TName };
  readonly binding: ScalarBinding;
};

/** One entry of the compiler-owned catalog: a field factory, or an internal scalar. */
export type CatalogScalar = ScalarFactory | InternalScalar;

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
  TName extends string = CatalogScalarName,
> {
  resolve(
    name: string,
    validationProfile: ScalarValidationProfile,
  ): ScalarBinding | undefined;
  /** Every scalar in catalog order. The reactor host declares all of them. */
  readonly names: readonly TName[];
  /** The scalars a document model or subgraph may reference, in catalog order. */
  readonly authorNames: readonly Exclude<TName, InternalScalarName>[];
  /** The scalars only the reactor host declares, in catalog order. `names` is `authorNames` and these, interleaved. */
  readonly internalNames: readonly Exclude<TName, PowerhouseScalarName>[];
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
