import type {
  DirectiveUseDefinition,
  JsonValue,
} from "@powerhousedao/shared/document-model";
import type { z } from "zod";
import type { ScalarBinding } from "./scalars/types.js";

export type FieldValidationOptions<TRequired extends boolean = boolean> = {
  readonly required?: TRequired;
};

type FieldTextOptions = {
  readonly description?: string;
  readonly deprecated?: string;
};

export type FieldPresentationOptions = FieldTextOptions & {
  readonly defaultValue?: JsonValue;
};

export type FieldOptions<TRequired extends boolean = boolean> =
  FieldValidationOptions<TRequired> & FieldPresentationOptions;

type EqualsOption = {
  /**
   * Accepts only values matching `^equals$`, as `@equals(value:)` does in a
   * schema-first model.
   */
  readonly equals?: string;
};

export type ScalarFieldOptions<TRequired extends boolean = boolean> =
  FieldOptions<TRequired> & EqualsOption;

/** A JSON value as a `const` type parameter infers it: readonly throughout. */
export type JsonLiteral =
  | string
  | number
  | boolean
  | null
  | readonly JsonLiteral[]
  | { readonly [key: string]: JsonLiteral };

/**
 * What a builder takes, with `defaultValue` typed so the builder can infer
 * the default's literal type. When `TDefault` is not inferred, as under an
 * explicit `<TRequired>`, the slot still accepts any JSON value.
 */
export type FieldBuilderOptions<
  TRequired extends boolean = boolean,
  TDefault extends JsonLiteral | undefined = JsonLiteral | undefined,
> = FieldValidationOptions<TRequired> &
  FieldTextOptions & {
    readonly defaultValue?:
      | TDefault
      | (TDefault extends undefined ? JsonLiteral : never);
  };

export type ScalarBuilderOptions<
  TRequired extends boolean = boolean,
  TDefault extends JsonLiteral | undefined = JsonLiteral | undefined,
> = FieldBuilderOptions<TRequired, TDefault> & EqualsOption;

type IsLiteral<T> = T extends string
  ? string extends T
    ? false
    : true
  : T extends number
    ? number extends T
      ? false
      : true
    : T extends boolean
      ? boolean extends T
        ? false
        : true
      : T extends null
        ? true
        : T extends readonly unknown[]
          ? number extends T["length"]
            ? false
            : AllLiteral<T[number]>
          : T extends object
            ? string extends keyof T
              ? false
              : Partial<T> extends T
                ? [keyof T] extends [never]
                  ? true
                  : false
                : AllLiteral<T[keyof T]>
            : false;

type AllLiteral<T> = [T] extends [never]
  ? true
  : false extends IsLiteral<T>
    ? false
    : true;

/**
 * Whether a builder's options carried a default, from the inferred type of
 * `defaultValue`: `false` when absent, `true` for a literal, and `boolean`
 * when the type cannot tell, such as a widened `number`, an optional
 * property, or the constraint `ReturnType` instantiates. `boolean` keeps the
 * input key required, and accepts both other results.
 */
export type DefaultFlag<TDefault> = [TDefault] extends [undefined]
  ? false
  : undefined extends TDefault
    ? boolean
    : IsLiteral<TDefault> extends true
      ? true
      : boolean;

/**
 * A scalar builder. One generic signature, as before defaults counted, so a
 * call on a union of builders, an explicit `<TRequired>`, and `ReturnType`
 * keep working.
 */
export type ScalarBuilder<TBase, TInput = TBase> = <
  const TRequired extends boolean = false,
  const TDefault extends JsonLiteral | undefined = undefined,
>(
  options?: ScalarBuilderOptions<TRequired, TDefault>,
) => ScalarDescriptor<
  Nullable<TInput, TRequired>,
  Nullable<TBase, TRequired>,
  Nullable<TInput, TRequired>,
  TRequired,
  DefaultFlag<TDefault>
>;

export type FieldDefault =
  | { readonly present: false }
  | { readonly present: true; readonly value: JsonValue };

export type FieldPresentation = {
  readonly description: string | null;
  readonly deprecated: string | null;
  readonly default: FieldDefault;
  readonly directives: readonly DirectiveUseDefinition[];
};

export type NamedTypeKind = "enum" | "object" | "input" | "interface" | "union";
export type FieldUseKind = "scalar" | "list" | "ref";
export type DescriptorKind = NamedTypeKind | FieldUseKind;

export type ScalarIdentity = {
  readonly kind: "scalar";
  /** A GraphQL built-in or catalog name, or any name a `defineScalar` gave. */
  readonly name: string;
  readonly required: boolean;
};

export type ListIdentity = {
  readonly kind: "list";
  readonly required: boolean;
  readonly item: GraphQLIdentity;
};

export type ReferenceIdentity = {
  readonly kind: "ref";
  readonly required: boolean;
};

export type NamedTypeIdentity = {
  readonly kind: NamedTypeKind;
  readonly name: string | null;
  readonly description: string | null;
};

export type GraphQLIdentity =
  | ScalarIdentity
  | ListIdentity
  | ReferenceIdentity
  | NamedTypeIdentity;

export type DescriptorNode<TInput, TOutput, TSource = TOutput> = {
  readonly kind: DescriptorKind;
  readonly identity: GraphQLIdentity;
  readonly validator: z.ZodType;
  readonly __types?: {
    readonly input: TInput;
    readonly output: TOutput;
    readonly source: TSource;
  };
};

export const FIELD_USE_ROLE = "field use" as const;
export const NAMED_TYPE_ROLE =
  "named type; wrap it with ph.ref(Type) to use it as a field" as const;

export type FieldDescriptor<
  TInput,
  TOutput,
  TSource = TOutput,
  TRequired extends boolean = boolean,
  TDefaulted extends boolean = boolean,
> = DescriptorNode<TInput, TOutput, TSource> & {
  readonly role: typeof FIELD_USE_ROLE;
  readonly kind: FieldUseKind;
  readonly required: TRequired;
  readonly presentation: FieldPresentation & {
    readonly default: { readonly present: TDefaulted };
  };
};

export type TypeDescriptor<TInput, TOutput, TSource = TOutput> = DescriptorNode<
  TInput,
  TOutput,
  TSource
> & {
  readonly role: typeof NAMED_TYPE_ROLE;
  readonly kind: NamedTypeKind;
  readonly name: string | null;
  readonly description: string | null;
};

export type StateRootDescriptor<
  TInput = unknown,
  TOutput = unknown,
  TSource = TOutput,
> = TypeDescriptor<TInput, TOutput, TSource> & {
  readonly kind: "object";
};

export type AnyFieldDescriptor = FieldDescriptor<any, any, any>;
export type AnyTypeDescriptor = TypeDescriptor<any, any, any>;
export type AnyDescriptor = AnyFieldDescriptor | AnyTypeDescriptor;

export type Nullable<T, TRequired extends boolean> = TRequired extends true
  ? T
  : T | null | undefined;

export type InputOf<T> =
  T extends DescriptorNode<infer TInput, any, any> ? TInput : never;
export type OutputOf<T> =
  T extends DescriptorNode<any, infer TOutput, any> ? TOutput : never;
export type SourceOf<T> =
  T extends DescriptorNode<any, any, infer TSource> ? TSource : never;
export type RequiredOf<T> = T extends { readonly required: infer TRequired }
  ? TRequired
  : never;
export type DefaultedOf<T> = T extends {
  readonly presentation: { readonly default: { readonly present: infer P } };
}
  ? P
  : never;

export type ObjectFields = Readonly<Record<string, AnyFieldDescriptor>>;

/**
 * A member an output object declares but no source carries.
 *
 * Structural, and declared here rather than in the subgraph module, because
 * the object member algebra is what has to admit it: the rich descriptor lives
 * beside the subgraph builders and satisfies this shape.
 */
export type ComputedMember = {
  readonly kind: "computed-field";
  readonly __types?: {
    readonly input: never;
    readonly output: unknown;
    readonly source: { readonly [K in ComputedSourceBrand]: true };
  };
};

/** What an output object may hold: stored fields, and computed members. */
export type OutputMembers = Readonly<
  Record<string, AnyFieldDescriptor | ComputedMember>
>;

/** The members of an output object that a source really carries. */
export type StoredFieldsOf<TMembers extends OutputMembers> = {
  [
    K in keyof TMembers as TMembers[K] extends AnyFieldDescriptor ? K : never
  ]: TMembers[K] extends AnyFieldDescriptor ? TMembers[K] : never;
};

/**
 * A caller may omit a defaulted field, as the generated input type says.
 * GraphQL fills the default in before a resolver runs, so what a resolver
 * receives keeps every required key: that is the input's source shape.
 */
type RequiredInputKeys<
  TFields extends ObjectFields,
  TOmitDefaulted extends boolean,
> = {
  [K in keyof TFields]: RequiredOf<TFields[K]> extends true
    ? TOmitDefaulted extends true
      ? DefaultedOf<TFields[K]> extends true
        ? never
        : K
      : K
    : never;
}[keyof TFields];

export type InputObjectOf<TFields extends ObjectFields> = {
  -readonly [K in RequiredInputKeys<TFields, true>]: InputOf<TFields[K]>;
} & {
  -readonly [
    K in Exclude<keyof TFields, RequiredInputKeys<TFields, true>>
  ]?: InputOf<TFields[K]>;
};

export type ResolvedInputObjectOf<TFields extends ObjectFields> = {
  -readonly [K in RequiredInputKeys<TFields, false>]: SourceOf<TFields[K]>;
} & {
  -readonly [
    K in Exclude<keyof TFields, RequiredInputKeys<TFields, false>>
  ]?: SourceOf<TFields[K]>;
};

export type OutputObjectOf<TFields extends OutputMembers> = {
  -readonly [K in keyof TFields]: OutputOf<TFields[K]>;
};

/**
 * What a resolver supplies for an object.
 *
 * A computed member is dropped: it is completed by a resolver of its own, so
 * asking the object's own resolver for it would mean supplying a value twice.
 * The brand is a unique symbol, so nothing an author could write matches it
 * by accident.
 */
export type SourceObjectOf<TFields extends OutputMembers> = {
  -readonly [
    K in keyof TFields as SourceOf<TFields[K]> extends {
      readonly [COMPUTED_SOURCE_BRAND]: true;
    }
      ? never
      : K
  ]: SourceOf<TFields[K]>;
};

declare const COMPUTED_SOURCE_BRAND: unique symbol;
export type ComputedSourceBrand = typeof COMPUTED_SOURCE_BRAND;

export type EnumValueInput =
  | string
  | {
      readonly name: string;
      readonly description?: string;
      readonly deprecated?: string;
    };

export type EnumValueNameOf<TValue extends EnumValueInput> =
  TValue extends string
    ? TValue
    : TValue extends { readonly name: infer TName extends string }
      ? TName
      : never;

export type EnumValue = {
  readonly name: string;
  readonly description: string | null;
  readonly deprecated: string | null;
};

export type EnumDescriptor<
  TValues extends readonly EnumValueInput[] = readonly EnumValueInput[],
> = TypeDescriptor<
  EnumValueNameOf<TValues[number]>,
  EnumValueNameOf<TValues[number]>,
  EnumValueNameOf<TValues[number]>
> & {
  readonly kind: "enum";
  readonly name: string;
  readonly values: readonly EnumValue[];
};

export type InterfaceDescriptor<
  TFields extends ObjectFields = ObjectFields,
  // `any` breaks what would otherwise be a circular default.
  TImplements extends readonly InterfaceDescriptor<ObjectFields, any>[] =
    readonly InterfaceDescriptor<ObjectFields, any>[],
> = TypeDescriptor<
  InputObjectOf<TFields>,
  OutputObjectOf<TFields>,
  SourceObjectOf<TFields>
> & {
  readonly kind: "interface";
  readonly name: string;
  readonly fields: TFields;
  readonly implements: TImplements;
};

export type ObjectDescriptor<
  // The default admits computed members, so a bare `ObjectDescriptor` — a
  // union member, an `implements` entry — accepts an object that has one.
  TFields extends OutputMembers = OutputMembers,
  TImplements extends readonly InterfaceDescriptor[] =
    readonly InterfaceDescriptor[],
> = TypeDescriptor<
  // An object is never an input, so its input shape is its stored fields
  // only: a computed member has nothing to contribute to one.
  InputObjectOf<StoredFieldsOf<TFields>>,
  OutputObjectOf<TFields>,
  SourceObjectOf<TFields>
> & {
  readonly kind: "object";
  readonly name: string;
  readonly fields: TFields;
  readonly implements: TImplements;
  /**
   * Members a resolver supplies rather than the source carrying them.
   *
   * Separate from `fields` so every existing reader of `fields` sees what it
   * always saw: a computed member belongs to the schema, not to the stored
   * shape, and a document model's state root may not declare one at all.
   */
  readonly computed?: Readonly<Record<string, unknown>>;
  /** `Type.computedTokens.<field>`, the handle a subgraph binds through. */
  readonly computedTokens?: Readonly<Record<string, unknown>>;
};

export type InputDescriptor<TFields extends ObjectFields = ObjectFields> =
  TypeDescriptor<
    InputObjectOf<TFields>,
    InputObjectOf<TFields>,
    ResolvedInputObjectOf<TFields>
  > & {
    readonly kind: "input";
    readonly fields: TFields;
  };

export type UnionDescriptor<
  TMembers extends readonly ObjectDescriptor[] = readonly ObjectDescriptor[],
> = TypeDescriptor<
  InputOf<TMembers[number]>,
  OutputOf<TMembers[number]>,
  SourceOf<TMembers[number]>
> & {
  readonly kind: "union";
  readonly name: string;
  readonly members: TMembers;
};

export type RefTarget = AnyTypeDescriptor | (() => AnyTypeDescriptor);

export type ReferenceDescriptor<
  TInput,
  TOutput,
  TSource = TOutput,
  TRequired extends boolean = boolean,
  TDefaulted extends boolean = boolean,
> = FieldDescriptor<TInput, TOutput, TSource, TRequired, TDefaulted> & {
  readonly kind: "ref";
  readonly target: RefTarget;
};

export type ListDescriptor<
  TInput,
  TOutput,
  TSource = TOutput,
  TRequired extends boolean = boolean,
  TDefaulted extends boolean = boolean,
> = FieldDescriptor<TInput, TOutput, TSource, TRequired, TDefaulted> & {
  readonly kind: "list";
  readonly item: AnyFieldDescriptor;
};

export type ScalarDescriptor<
  TInput,
  TOutput,
  TSource = TOutput,
  TRequired extends boolean = boolean,
  TDefaulted extends boolean = boolean,
> = FieldDescriptor<TInput, TOutput, TSource, TRequired, TDefaulted> & {
  readonly kind: "scalar";
  readonly scalarName: string;
  readonly baseValidator: z.ZodType;
  /**
   * The binding of a scalar `defineScalar` compiled. Absent for a GraphQL
   * built-in. A package scalar reaches the compiler only through this.
   */
  readonly binding?: ScalarBinding;
};

export type Mutable<T> = T extends readonly (infer TItem)[]
  ? Mutable<TItem>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
