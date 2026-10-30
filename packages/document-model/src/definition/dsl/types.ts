import type {
  DirectiveUseDefinition,
  JsonValue,
} from "@powerhousedao/shared/document-model";
import type { z } from "zod";
import type { ScalarDefinition } from "../../scalars/types.js";

type FieldValidationOptions<TRequired extends boolean = boolean> = {
  readonly required?: TRequired;
};

type FieldTextOptions = {
  readonly description?: string;
  readonly deprecated?: string;
};

type FieldPresentationOptions = FieldTextOptions & {
  readonly defaultValue?: JsonValue;
};

export type FieldOptions<TRequired extends boolean = boolean> =
  FieldValidationOptions<TRequired> & FieldPresentationOptions;

type EqualsOption = {
  readonly equals?: string;
};

export type ScalarFieldOptions<TRequired extends boolean = boolean> =
  FieldOptions<TRequired> & EqualsOption;

export type JsonLiteral =
  | string
  | number
  | boolean
  | null
  | readonly JsonLiteral[]
  | { readonly [key: string]: JsonLiteral };

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

export type DefaultFlag<TDefault> = [TDefault] extends [undefined]
  ? false
  : undefined extends TDefault
    ? boolean
    : IsLiteral<TDefault> extends true
      ? true
      : boolean;

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

type NamedTypeKind = "enum" | "object" | "input" | "interface" | "union";
type FieldUseKind = "scalar" | "list" | "ref";
type DescriptorKind = NamedTypeKind | FieldUseKind;

type ScalarIdentity = {
  readonly kind: "scalar";
  readonly name: string;
  readonly required: boolean;
};

type ListIdentity = {
  readonly kind: "list";
  readonly required: boolean;
  readonly item: GraphQLIdentity;
};

type ReferenceIdentity = {
  readonly kind: "ref";
  readonly required: boolean;
};

type NamedTypeIdentity = {
  readonly kind: NamedTypeKind;
  readonly name: string | null;
  readonly description: string | null;
};

export type GraphQLIdentity =
  | ScalarIdentity
  | ListIdentity
  | ReferenceIdentity
  | NamedTypeIdentity;

type DescriptorNode<TInput, TOutput, TSource = TOutput> = {
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

type FieldDescriptor<
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

type TypeDescriptor<TInput, TOutput, TSource = TOutput> = DescriptorNode<
  TInput,
  TOutput,
  TSource
> & {
  readonly role: typeof NAMED_TYPE_ROLE;
  readonly kind: NamedTypeKind;
  readonly name: string | null;
  readonly description: string | null;
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

type RequiredKeys<TFields extends ObjectFields> = {
  [K in keyof TFields]: RequiredOf<TFields[K]> extends true ? K : never;
}[keyof TFields];

/** A caller may omit a required field that has a default. */
type CallerRequiredKeys<TFields extends ObjectFields> = {
  [K in RequiredKeys<TFields>]: DefaultedOf<TFields[K]> extends true
    ? never
    : K;
}[RequiredKeys<TFields>];

export type InputObjectOf<TFields extends ObjectFields> = {
  -readonly [K in CallerRequiredKeys<TFields>]: InputOf<TFields[K]>;
} & {
  -readonly [
    K in Exclude<keyof TFields, CallerRequiredKeys<TFields>>
  ]?: InputOf<TFields[K]>;
};

type ResolvedInputObjectOf<TFields extends ObjectFields> = {
  -readonly [K in RequiredKeys<TFields>]: SourceOf<TFields[K]>;
} & {
  -readonly [K in Exclude<keyof TFields, RequiredKeys<TFields>>]?: SourceOf<
    TFields[K]
  >;
};

export type OutputObjectOf<TFields extends ObjectFields> = {
  -readonly [K in keyof TFields]: OutputOf<TFields[K]>;
};

type SourceObjectOf<TFields extends ObjectFields> = {
  -readonly [K in keyof TFields]: SourceOf<TFields[K]>;
};

export type EnumValueInput =
  | string
  | {
      readonly name: string;
      readonly description?: string;
      readonly deprecated?: string;
    };

type EnumValueNameOf<TValue extends EnumValueInput> = TValue extends string
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
  TFields extends ObjectFields = ObjectFields,
  TImplements extends readonly InterfaceDescriptor[] =
    readonly InterfaceDescriptor[],
> = TypeDescriptor<
  InputObjectOf<TFields>,
  OutputObjectOf<TFields>,
  SourceObjectOf<TFields>
> & {
  readonly kind: "object";
  readonly name: string;
  readonly fields: TFields;
  readonly implements: TImplements;
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

type RefTarget = AnyTypeDescriptor | (() => AnyTypeDescriptor);

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
  readonly definition?: ScalarDefinition;
};
