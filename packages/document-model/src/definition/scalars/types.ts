import type {
  DefinitionDiagnosticV1,
  JsonValue,
  PowerhouseScalarNameV1,
  ScalarDefinitionV1,
  ScalarRepresentationV1,
  ScalarValidationProfileV1,
  ScalarVectorCaseV1,
  ScalarZeroV1,
} from "@powerhousedao/shared/document-model";
import type { z } from "zod";
import type { FieldDescriptor } from "../types.js";

export type ScalarLiteralNode =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "int"; readonly value: string }
  | { readonly kind: "float"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "null" }
  | { readonly kind: "enum"; readonly value: string }
  | { readonly kind: "list"; readonly values: readonly ScalarLiteralNode[] }
  | {
      readonly kind: "object";
      readonly fields: readonly {
        readonly name: string;
        readonly value: ScalarLiteralNode;
      }[];
    }
  | { readonly kind: "variable"; readonly name: string };

export type ScalarCoercion<TBase> = {
  readonly parseValue: (input: unknown) => TBase;
  readonly parseLiteral: (node: ScalarLiteralNode) => TBase;
  readonly serialize: (value: unknown) => unknown;
};

export type ScalarExemptionDeclaration = {
  readonly profile: "document-engineering-1.40";
  readonly paths: readonly string[];
  readonly caseIds: readonly string[];
};

export type ScalarDeclaration<TName extends PowerhouseScalarNameV1, TBase> = {
  readonly name: TName;
  readonly coercionProfile: ScalarValidationProfileV1;
  readonly representation: ScalarRepresentationV1;
  readonly persistable: boolean;
  readonly description: string;
  readonly validator: z.ZodType<TBase, TBase>;
  readonly coercion: ScalarCoercion<TBase> | "derive";
  readonly zero: ScalarZeroV1;
  readonly accepts: readonly [ScalarVectorCaseV1, ...ScalarVectorCaseV1[]];
  readonly rejects: readonly [ScalarVectorCaseV1, ...ScalarVectorCaseV1[]];
  readonly exemption?: ScalarExemptionDeclaration;
  readonly typescriptType: string;
  readonly zodSource: string;
};

export type ScalarValidationOptions<TRequired extends boolean = false> = {
  readonly required?: TRequired;
};

type Nullable<T, TRequired extends boolean> = TRequired extends true
  ? T
  : T | null | undefined;

export type ScalarFactory<TName extends PowerhouseScalarNameV1, TBase> = {
  <const TRequired extends boolean = false>(
    options?: ScalarValidationOptions<TRequired>,
  ): FieldDescriptor<
    Nullable<TBase, TRequired>,
    Nullable<TBase, TRequired>,
    Nullable<TBase, TRequired>,
    TRequired
  >;
  readonly role: `field-use factory; call it, as ph.${string}({ required: true })`;
  readonly kind: "scalar-factory";
  readonly declaration: ScalarDefinitionV1 & { readonly name: TName };
};

export type ScalarBinding = {
  readonly definition: ScalarDefinitionV1;
  readonly validationProfile: ScalarValidationProfileV1;
  readonly validator: z.ZodType;
  readonly coercion: ScalarCoercion<unknown>;
  readonly typescriptType: string;
  readonly zodSource: string;
  readonly typedef: `scalar ${string}`;
};

export interface ScalarCatalogInterface {
  resolve(
    name: string,
    validationProfile: ScalarValidationProfileV1,
  ): ScalarBinding | undefined;
  readonly names: readonly PowerhouseScalarNameV1[];
  readonly validationProfiles: readonly ScalarValidationProfileV1[];
  readonly digest: `sha256:${string}`;
}

export type ScalarCatalogReport = {
  readonly kind: "powerhouse.scalar-catalog";
  readonly formatVersion: 1;
  readonly catalogDigest: `sha256:${string}`;
  readonly entries: readonly {
    readonly name: string;
    readonly validationProfile: ScalarValidationProfileV1;
    readonly definitionDigest: `sha256:${string}`;
    readonly coercionSource: "derived" | "explicit";
    readonly exempted: boolean;
  }[];
  readonly diagnostics: readonly DefinitionDiagnosticV1[];
};

export type BuiltScalar<
  TName extends PowerhouseScalarNameV1 = PowerhouseScalarNameV1,
  TBase = unknown,
> = {
  readonly declaration: ScalarDeclaration<TName, TBase>;
  readonly definition: ScalarDefinitionV1 & { readonly name: TName };
  readonly factory: ScalarFactory<TName, TBase>;
  readonly binding: ScalarBinding;
};

export type ScalarCatalogBuildResult = {
  readonly catalog?: ScalarCatalogInterface;
  readonly report: ScalarCatalogReport;
};

export type ScalarJsonObject = Readonly<Record<string, unknown>>;
export type ScalarJson = JsonValue;
