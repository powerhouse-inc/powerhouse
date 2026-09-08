import type {
  JsonValue,
  NamedGraphQLTypeDefinitionV1,
  ScalarNameV1,
  TypeReferenceDefinitionV1,
} from "@powerhousedao/shared/document-model";
import type { z } from "zod";

export type FieldValidationOptions<TRequired extends boolean = false> = {
  readonly required?: TRequired;
};

export type FieldPresentationOptions = {
  readonly description?: string;
  readonly deprecated?: string;
  readonly defaultValue?: JsonValue;
};

export type FieldOptions<TRequired extends boolean = false> =
  FieldValidationOptions<TRequired>;

export type FieldPresentation = {
  readonly description: string | null;
  readonly deprecated: string | null;
  readonly hasDefaultValue: boolean;
  readonly defaultValue?: JsonValue;
};

export type ScalarIdentity = {
  readonly kind: "scalar";
  readonly name: ScalarNameV1;
  readonly required: boolean;
};

export type ListIdentity = {
  readonly kind: "list";
  readonly required: boolean;
};

export type ReferenceIdentity = {
  readonly kind: "ref";
  readonly required: boolean;
};

export type NamedTypeIdentity = {
  readonly kind: "enum" | "object" | "input" | "interface" | "union";
  readonly name: string | null;
  readonly description: string | null;
};

export type GraphQLIdentity =
  | ScalarIdentity
  | ListIdentity
  | ReferenceIdentity
  | NamedTypeIdentity;

export type DescriptorNode<TInput, TOutput, TSource = TOutput> = {
  readonly kind:
    | "scalar"
    | "enum"
    | "object"
    | "input"
    | "interface"
    | "union"
    | "list"
    | "ref";
  readonly identity: GraphQLIdentity;
  readonly validator: z.ZodType<TOutput, TInput>;
  readonly __types?: {
    readonly input: TInput;
    readonly output: TOutput;
    readonly source: TSource;
  };
};

export type FieldDescriptor<
  TInput,
  TOutput,
  TSource = TOutput,
  TRequired extends boolean = boolean,
> = DescriptorNode<TInput, TOutput, TSource> & {
  readonly role: "field use";
  readonly kind: "scalar" | "list" | "ref";
  readonly required: TRequired;
  readonly presentation: FieldPresentation;
};

export type TypeDescriptor<TInput, TOutput, TSource = TOutput> = DescriptorNode<
  TInput,
  TOutput,
  TSource
> & {
  readonly role: "named type; wrap it with ph.ref(Type) to use it as a field";
  readonly kind: "enum" | "object" | "input" | "interface" | "union";
  readonly name: string | null;
  readonly description: string | null;
};

export type AnyFieldDescriptor = FieldDescriptor<any, any, any>;
export type AnyTypeDescriptor = TypeDescriptor<any, any, any>;

export type InputOf<T> =
  T extends DescriptorNode<infer TInput, any, any> ? TInput : never;
export type OutputOf<T> =
  T extends DescriptorNode<any, infer TOutput, any> ? TOutput : never;
export type SourceOf<T> =
  T extends DescriptorNode<any, any, infer TSource> ? TSource : never;
export type RequiredOf<T> = T extends { readonly required: infer TRequired }
  ? TRequired
  : never;

export type ObjectFields = Readonly<Record<string, AnyFieldDescriptor>>;

export type ComputedFieldDescriptor<
  TArgs extends ObjectFields = ObjectFields,
  TReturns extends AnyFieldDescriptor = AnyFieldDescriptor,
> = {
  readonly kind: "computed-field";
  readonly args: TArgs;
  readonly returns: TReturns;
  readonly presentation: Omit<FieldPresentation, "hasDefaultValue">;
};

export type AnyComputedFieldDescriptor = ComputedFieldDescriptor<
  ObjectFields,
  AnyFieldDescriptor
>;

export type ObjectMembers = Readonly<
  Record<string, AnyFieldDescriptor | AnyComputedFieldDescriptor>
>;

type StoredObjectFields<TMembers extends ObjectMembers> = {
  readonly [K in keyof TMembers as TMembers[K] extends AnyFieldDescriptor
    ? K
    : never]: Extract<TMembers[K], AnyFieldDescriptor>;
};

export type ComputedFieldToken<
  TParent = unknown,
  TArgs extends ObjectFields = ObjectFields,
  TReturns extends AnyFieldDescriptor = AnyFieldDescriptor,
> = {
  readonly kind: "computed-field-token";
  readonly objectName: string;
  readonly key: string;
  readonly args: TArgs;
  readonly returns: TReturns;
  readonly presentation: Omit<FieldPresentation, "hasDefaultValue">;
  readonly __types?: { readonly parent: TParent };
};

type ComputedObjectFields<TMembers extends ObjectMembers> = {
  readonly [K in keyof TMembers as TMembers[K] extends AnyComputedFieldDescriptor
    ? K
    : never]: TMembers[K] extends ComputedFieldDescriptor<
    infer TArgs,
    infer TReturns
  >
    ? ComputedFieldToken<SourceObjectOf<TMembers>, TArgs, TReturns>
    : never;
};

export type SourceObjectOf<TMembers extends ObjectMembers> = {
  -readonly [K in keyof StoredObjectFields<TMembers>]: SourceOf<
    StoredObjectFields<TMembers>[K]
  >;
};

export type OutputObjectOf<TMembers extends ObjectMembers> = {
  -readonly [K in keyof TMembers]: TMembers[K] extends AnyFieldDescriptor
    ? OutputOf<TMembers[K]>
    : TMembers[K] extends ComputedFieldDescriptor<ObjectFields, infer TReturns>
      ? OutputOf<TReturns>
      : never;
};

type RequiredInputKeys<TFields extends ObjectFields> = {
  [K in keyof TFields]: RequiredOf<TFields[K]> extends true ? K : never;
}[keyof TFields];

type OptionalInputKeys<TFields extends ObjectFields> = Exclude<
  keyof TFields,
  RequiredInputKeys<TFields>
>;

export type InputObjectOf<TFields extends ObjectFields> = {
  -readonly [K in RequiredInputKeys<TFields>]: InputOf<TFields[K]>;
} & {
  -readonly [K in OptionalInputKeys<TFields>]?: InputOf<TFields[K]>;
};

export type EnumDescriptor<
  TValues extends readonly string[] = readonly string[],
> = TypeDescriptor<TValues[number], TValues[number], TValues[number]> & {
  readonly kind: "enum";
  readonly values: TValues;
};

export type InterfaceDescriptor<TFields extends ObjectFields = ObjectFields> =
  TypeDescriptor<
    InputObjectOf<TFields>,
    { -readonly [K in keyof TFields]: OutputOf<TFields[K]> },
    { -readonly [K in keyof TFields]: SourceOf<TFields[K]> }
  > & {
    readonly kind: "interface";
    readonly fields: TFields;
  };

export type ObjectDescriptor<
  TMembers extends ObjectMembers = ObjectMembers,
  TImplements extends readonly InterfaceDescriptor[] =
    readonly InterfaceDescriptor[],
> = TypeDescriptor<
  SourceObjectOf<TMembers>,
  OutputObjectOf<TMembers>,
  SourceObjectOf<TMembers>
> & {
  readonly kind: "object";
  readonly fields: StoredObjectFields<TMembers>;
  readonly computed: ComputedObjectFields<TMembers>;
  readonly implements: TImplements;
  readonly memberOrder: readonly (keyof TMembers & string)[];
};

export type StateRootDescriptor<
  TInput = unknown,
  TOutput = unknown,
  TSource = TOutput,
> = TypeDescriptor<TInput, TOutput, TSource> & {
  readonly kind: "object";
};

export type InputDescriptor<TFields extends ObjectFields = ObjectFields> =
  TypeDescriptor<
    InputObjectOf<TFields>,
    InputObjectOf<TFields>,
    InputObjectOf<TFields>
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
  readonly members: TMembers;
};

export type RefTarget = AnyTypeDescriptor | (() => AnyTypeDescriptor);

export type ReferenceDescriptor<
  TInput,
  TOutput,
  TSource = TOutput,
  TRequired extends boolean = boolean,
> = FieldDescriptor<TInput, TOutput, TSource, TRequired> & {
  readonly kind: "ref";
  readonly target: RefTarget;
};

export type ListDescriptor<
  TInput,
  TOutput,
  TSource = TOutput,
  TRequired extends boolean = boolean,
> = FieldDescriptor<TInput, TOutput, TSource, TRequired> & {
  readonly kind: "list";
  readonly item: AnyFieldDescriptor;
};

export type ScalarDescriptor<
  TInput,
  TOutput,
  TSource = TOutput,
  TRequired extends boolean = boolean,
> = FieldDescriptor<TInput, TOutput, TSource, TRequired> & {
  readonly kind: "scalar";
  readonly scalarName: ScalarNameV1;
};

export type DescriptorDefinition =
  | NamedGraphQLTypeDefinitionV1
  | TypeReferenceDefinitionV1;

export type Mutable<T> = T extends readonly (infer TItem)[]
  ? Mutable<TItem>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
