/**
 * Import-free wire types shared by definition authors, tooling, and hosts.
 * Keep this file limited to JSON-safe data so importing a stored definition
 * never pulls compiler or GraphQL runtime dependencies into a consumer.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type DefinitionSourceV1 = {
  readonly specifier: string;
  readonly exportPath?: readonly string[];
};

export type DefinitionDiagnosticV1 = {
  readonly code: `PH-${string}`;
  readonly severity: "error" | "warning";
  readonly phase:
    | "configuration"
    | "import"
    | "definition"
    | "composition"
    | "authorization"
    | "typecheck"
    | "package"
    | "replay";
  readonly source?: DefinitionSourceV1;
  readonly definition?: {
    readonly kind: "document-model" | "subgraph" | "scalar" | "package";
    readonly key: string;
    readonly version?: number;
  };
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly expected?: string;
  readonly received?: string;
  readonly repair: string;
  readonly related?: readonly {
    readonly source: DefinitionSourceV1;
    readonly path: readonly (string | number)[];
    readonly message: string;
  }[];
};

export type GraphQLNameNodeV1 = {
  readonly kind: "Name";
  readonly value: string;
};

export type GraphQLNamedTypeNodeV1 = {
  readonly kind: "NamedType";
  readonly name: GraphQLNameNodeV1;
};

export type GraphQLListTypeNodeV1 = {
  readonly kind: "ListType";
  readonly type: GraphQLTypeNodeV1;
};

export type GraphQLNonNullTypeNodeV1 = {
  readonly kind: "NonNullType";
  readonly type: GraphQLNamedTypeNodeV1 | GraphQLListTypeNodeV1;
};

export type GraphQLTypeNodeV1 =
  | GraphQLNamedTypeNodeV1
  | GraphQLListTypeNodeV1
  | GraphQLNonNullTypeNodeV1;

export type GraphQLConstValueNodeV1 =
  | { readonly kind: "IntValue"; readonly value: string }
  | { readonly kind: "FloatValue"; readonly value: string }
  | {
      readonly kind: "StringValue";
      readonly value: string;
      readonly block?: boolean;
    }
  | { readonly kind: "BooleanValue"; readonly value: boolean }
  | { readonly kind: "NullValue" }
  | { readonly kind: "EnumValue"; readonly value: string }
  | {
      readonly kind: "ListValue";
      readonly values: readonly GraphQLConstValueNodeV1[];
    }
  | {
      readonly kind: "ObjectValue";
      readonly fields: readonly GraphQLObjectFieldNodeV1[];
    };

export type GraphQLObjectFieldNodeV1 = {
  readonly kind: "ObjectField";
  readonly name: GraphQLNameNodeV1;
  readonly value: GraphQLConstValueNodeV1;
};

export type GraphQLArgumentNodeV1 = {
  readonly kind: "Argument";
  readonly name: GraphQLNameNodeV1;
  readonly value: GraphQLConstValueNodeV1;
};

export type GraphQLDirectiveNodeV1 = {
  readonly kind: "Directive";
  readonly name: GraphQLNameNodeV1;
  readonly arguments: readonly GraphQLArgumentNodeV1[];
};

export type GraphQLInputValueDefinitionNodeV1 = {
  readonly kind: "InputValueDefinition";
  readonly description?: Extract<
    GraphQLConstValueNodeV1,
    { readonly kind: "StringValue" }
  >;
  readonly name: GraphQLNameNodeV1;
  readonly type: GraphQLTypeNodeV1;
  readonly defaultValue?: GraphQLConstValueNodeV1;
  readonly directives: readonly GraphQLDirectiveNodeV1[];
};

export type GraphQLFieldDefinitionNodeV1 = {
  readonly kind: "FieldDefinition";
  readonly description?: Extract<
    GraphQLConstValueNodeV1,
    { readonly kind: "StringValue" }
  >;
  readonly name: GraphQLNameNodeV1;
  readonly arguments: readonly GraphQLInputValueDefinitionNodeV1[];
  readonly type: GraphQLTypeNodeV1;
  readonly directives: readonly GraphQLDirectiveNodeV1[];
};

export type GraphQLEnumValueDefinitionNodeV1 = {
  readonly kind: "EnumValueDefinition";
  readonly description?: Extract<
    GraphQLConstValueNodeV1,
    { readonly kind: "StringValue" }
  >;
  readonly name: GraphQLNameNodeV1;
  readonly directives: readonly GraphQLDirectiveNodeV1[];
};

type GraphQLNamedDefinitionNodeV1 = {
  readonly description?: Extract<
    GraphQLConstValueNodeV1,
    { readonly kind: "StringValue" }
  >;
  readonly name: GraphQLNameNodeV1;
  readonly directives: readonly GraphQLDirectiveNodeV1[];
};

export type GraphQLScalarTypeDefinitionNodeV1 = GraphQLNamedDefinitionNodeV1 & {
  readonly kind: "ScalarTypeDefinition";
};

export type GraphQLObjectTypeDefinitionNodeV1 = GraphQLNamedDefinitionNodeV1 & {
  readonly kind: "ObjectTypeDefinition";
  readonly interfaces: readonly GraphQLNamedTypeNodeV1[];
  readonly fields: readonly GraphQLFieldDefinitionNodeV1[];
};

export type GraphQLInterfaceTypeDefinitionNodeV1 =
  GraphQLNamedDefinitionNodeV1 & {
    readonly kind: "InterfaceTypeDefinition";
    readonly interfaces: readonly GraphQLNamedTypeNodeV1[];
    readonly fields: readonly GraphQLFieldDefinitionNodeV1[];
  };

export type GraphQLUnionTypeDefinitionNodeV1 = GraphQLNamedDefinitionNodeV1 & {
  readonly kind: "UnionTypeDefinition";
  readonly types: readonly GraphQLNamedTypeNodeV1[];
};

export type GraphQLEnumTypeDefinitionNodeV1 = GraphQLNamedDefinitionNodeV1 & {
  readonly kind: "EnumTypeDefinition";
  readonly values: readonly GraphQLEnumValueDefinitionNodeV1[];
};

export type GraphQLInputObjectTypeDefinitionNodeV1 =
  GraphQLNamedDefinitionNodeV1 & {
    readonly kind: "InputObjectTypeDefinition";
    readonly fields: readonly GraphQLInputValueDefinitionNodeV1[];
  };

export type GraphQLSchemaDefinitionNodeV1 = {
  readonly kind: "SchemaDefinition";
  readonly description?: Extract<
    GraphQLConstValueNodeV1,
    { readonly kind: "StringValue" }
  >;
  readonly directives: readonly GraphQLDirectiveNodeV1[];
  readonly operationTypes: readonly {
    readonly kind: "OperationTypeDefinition";
    readonly operation: "query" | "mutation" | "subscription";
    readonly type: GraphQLNamedTypeNodeV1;
  }[];
};

export type GraphQLDirectiveDefinitionNodeV1 = {
  readonly kind: "DirectiveDefinition";
  readonly description?: Extract<
    GraphQLConstValueNodeV1,
    { readonly kind: "StringValue" }
  >;
  readonly name: GraphQLNameNodeV1;
  readonly arguments: readonly GraphQLInputValueDefinitionNodeV1[];
  readonly repeatable: boolean;
  readonly locations: readonly GraphQLNameNodeV1[];
};

export type GraphQLTypeSystemDefinitionNodeV1 =
  | GraphQLSchemaDefinitionNodeV1
  | GraphQLScalarTypeDefinitionNodeV1
  | GraphQLObjectTypeDefinitionNodeV1
  | GraphQLInterfaceTypeDefinitionNodeV1
  | GraphQLUnionTypeDefinitionNodeV1
  | GraphQLEnumTypeDefinitionNodeV1
  | GraphQLInputObjectTypeDefinitionNodeV1
  | GraphQLDirectiveDefinitionNodeV1;

export type GraphQLTypeSystemExtensionNodeV1 =
  | (Omit<GraphQLSchemaDefinitionNodeV1, "kind" | "description"> & {
      readonly kind: "SchemaExtension";
    })
  | (Omit<GraphQLScalarTypeDefinitionNodeV1, "kind" | "description"> & {
      readonly kind: "ScalarTypeExtension";
    })
  | (Omit<GraphQLObjectTypeDefinitionNodeV1, "kind" | "description"> & {
      readonly kind: "ObjectTypeExtension";
    })
  | (Omit<GraphQLInterfaceTypeDefinitionNodeV1, "kind" | "description"> & {
      readonly kind: "InterfaceTypeExtension";
    })
  | (Omit<GraphQLUnionTypeDefinitionNodeV1, "kind" | "description"> & {
      readonly kind: "UnionTypeExtension";
    })
  | (Omit<GraphQLEnumTypeDefinitionNodeV1, "kind" | "description"> & {
      readonly kind: "EnumTypeExtension";
    })
  | (Omit<GraphQLInputObjectTypeDefinitionNodeV1, "kind" | "description"> & {
      readonly kind: "InputObjectTypeExtension";
    });

export type LocationFreeGraphQLDocumentNodeV1 = {
  readonly kind: "Document";
  readonly definitions: readonly (
    | GraphQLTypeSystemDefinitionNodeV1
    | GraphQLTypeSystemExtensionNodeV1
  )[];
};

export type LegacyGraphQLDocumentCompatibilityV1 = {
  readonly kind: "graphql-ast-v1";
  readonly document: LocationFreeGraphQLDocumentNodeV1;
  readonly preserveDefinitionOrder: true;
};

export type GraphQLBuiltInScalarNameV1 =
  | "ID"
  | "String"
  | "Boolean"
  | "Int"
  | "Float";

export type PowerhouseScalarNameV1 =
  | "PHID"
  | "OID"
  | "OLabel"
  | "Currency"
  | "EmailAddress"
  | "EthereumAddress"
  | "URL"
  | "Date"
  | "DateTime"
  | "Amount_Money"
  | "Amount_Percentage"
  | "Amount_Tokens"
  | "Amount"
  | "Amount_Fiat"
  | "Amount_Crypto"
  | "Amount_Currency"
  | "Address"
  | "AttachmentRef"
  | "Unknown"
  | "Upload"
  | "JSONObject";

export type ScalarNameV1 = GraphQLBuiltInScalarNameV1 | PowerhouseScalarNameV1;

export type ScalarRepresentationV1 =
  | "string"
  | "number"
  | "boolean"
  | "json-object"
  | "json"
  | "opaque";

export type ScalarZeroV1 =
  | { readonly kind: "value"; readonly value: JsonValue }
  | { readonly kind: "none"; readonly reason: string };

export type ScalarValidationProfileV1 =
  | "document-engineering-1.40"
  | "catalog-v1";

export type ScalarGraphQLProfileV1 = "legacy-graphql-default-v1" | "catalog-v1";

export type ScalarVectorValueV1 =
  | { readonly kind: "json"; readonly value: JsonValue }
  | { readonly kind: "non-json"; readonly tag: "undefined" }
  | {
      readonly kind: "non-json";
      readonly tag: "bigint";
      readonly decimal: string;
    }
  | {
      readonly kind: "non-json";
      readonly tag: "date";
      readonly iso: string;
    }
  | {
      readonly kind: "non-json";
      readonly tag: "map";
      readonly entries: readonly (readonly [JsonValue, JsonValue])[];
    }
  | {
      readonly kind: "non-json";
      readonly tag: "upload";
      readonly fixtureId: string;
    };

export type ScalarVectorCaseV1 = {
  readonly id: string;
  readonly input: ScalarVectorValueV1;
};

export type ScalarDefinitionV1 = {
  readonly kind: "powerhouse.scalar";
  readonly formatVersion: 1;
  readonly name: PowerhouseScalarNameV1;
  readonly representation: ScalarRepresentationV1;
  readonly persistable: boolean;
  readonly description: string;
  readonly zero: ScalarZeroV1;
  readonly coercion: {
    readonly source: "derived" | "explicit";
    readonly exemption: {
      readonly profile: "document-engineering-1.40";
      readonly paths: readonly string[];
      readonly caseIds: readonly string[];
      readonly digest: `sha256:${string}`;
    } | null;
  };
  readonly vector: {
    readonly accepts: readonly ScalarVectorCaseV1[];
    readonly rejects: readonly ScalarVectorCaseV1[];
    readonly acceptanceDigest: `sha256:${string}`;
  };
  readonly coercionProfile: ScalarValidationProfileV1;
};

export type ScalarTypeReferenceDefinitionV1 = {
  readonly kind: "scalar";
  readonly name: ScalarNameV1;
  readonly required: boolean;
};

export type NamedTypeReferenceDefinitionV1 = {
  readonly kind: "named";
  readonly name: string;
  readonly required: boolean;
};

export type ListTypeReferenceDefinitionV1 = {
  readonly kind: "list";
  readonly required: boolean;
  readonly item: TypeReferenceDefinitionV1;
};

export type TypeReferenceDefinitionV1 =
  | ScalarTypeReferenceDefinitionV1
  | NamedTypeReferenceDefinitionV1
  | ListTypeReferenceDefinitionV1;

export type DirectiveUseDefinitionV1 = {
  readonly name: string;
  readonly arguments: readonly {
    readonly name: string;
    readonly value: JsonValue;
  }[];
};

export type FieldDefinitionV1 = {
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly deprecated: string | null;
  readonly args?: readonly InputFieldDefinitionV1[];
  readonly type: TypeReferenceDefinitionV1;
  readonly directives?: readonly DirectiveUseDefinitionV1[];
};

export type InputFieldDefinitionV1 = Omit<FieldDefinitionV1, "args"> & {
  readonly defaultValue?: JsonValue;
};

export type EnumValueDefinitionV1 = {
  readonly name: string;
  readonly description: string | null;
  readonly deprecated: string | null;
  readonly directives?: readonly DirectiveUseDefinitionV1[];
};

export type EnumTypeDefinitionV1 = {
  readonly kind: "enum";
  readonly name: string;
  readonly description: string | null;
  readonly values: readonly EnumValueDefinitionV1[];
};

export type ObjectTypeDefinitionV1 = {
  readonly kind: "object";
  readonly name: string;
  readonly description: string | null;
  readonly implements?: readonly string[];
  readonly fields: readonly FieldDefinitionV1[];
};

export type InterfaceTypeDefinitionV1 = {
  readonly kind: "interface";
  readonly name: string;
  readonly description: string | null;
  readonly implements?: readonly string[];
  readonly fields: readonly FieldDefinitionV1[];
};

export type InputTypeDefinitionV1 = {
  readonly kind: "input";
  readonly name: string;
  readonly description: string | null;
  readonly unknownKeys: "preserve" | "reject";
  readonly fields: readonly InputFieldDefinitionV1[];
};

export type UnionTypeDefinitionV1 = {
  readonly kind: "union";
  readonly name: string;
  readonly description: string | null;
  readonly members: readonly string[];
};

export type NamedGraphQLTypeDefinitionV1 =
  | EnumTypeDefinitionV1
  | ObjectTypeDefinitionV1
  | InterfaceTypeDefinitionV1
  | InputTypeDefinitionV1
  | UnionTypeDefinitionV1;

export type DocumentScalarReferenceDefinitionV1 = {
  readonly name: ScalarNameV1;
  readonly implementation: `powerhouse.catalog#${string}`;
  readonly coercionProfile: "document-engineering-1.40";
};

export type SubgraphScalarReferenceDefinitionV1 = {
  readonly name: ScalarNameV1;
  readonly implementation: `powerhouse.catalog#${string}`;
  readonly graphQLProfile: "legacy-graphql-default-v1";
};

export type DefinitionExampleV1 = {
  readonly id: string;
  readonly key: string;
  readonly value: string;
};

export type MaterializedStateDefinitionV1 = {
  readonly schema: string;
  readonly initialValue: string;
  readonly examples: readonly Omit<DefinitionExampleV1, "key">[];
};

export type NonEmptyStateDefinitionV1 = {
  readonly root: NamedTypeReferenceDefinitionV1;
  readonly initialValue: JsonValue;
  readonly examples: readonly DefinitionExampleV1[];
  readonly unknownKeys: "preserve";
  readonly materialized: MaterializedStateDefinitionV1;
};

export type EmptyLocalStateDefinitionV1 = {
  readonly root: null;
  readonly initialValue: Readonly<Record<string, never>>;
  readonly examples: readonly DefinitionExampleV1[];
  readonly unknownKeys: "preserve";
  readonly materialized: MaterializedStateDefinitionV1 & {
    readonly schema: "";
  };
};

export type StateDefinitionV1 =
  | NonEmptyStateDefinitionV1
  | EmptyLocalStateDefinitionV1;

export type CompiledErrorDefinitionV1 = {
  readonly id: string;
  readonly key: string;
  readonly code: string | null;
  readonly name: string | null;
  readonly description: string | null;
  readonly template: string | null;
};

export type DocumentModelOperationDefinitionV1 = {
  readonly id: string;
  readonly key: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly actionType: string;
  readonly creatorKey: string;
  readonly scope: "global" | "local";
  readonly input: InputTypeDefinitionV1 | null;
  readonly errors: readonly CompiledErrorDefinitionV1[];
  readonly examples: readonly DefinitionExampleV1[];
  readonly template: string | null;
  readonly reducer: string | null;
};

export type DocumentModelSpecificationDefinitionV1 = {
  readonly version: number;
  readonly scalars: readonly DocumentScalarReferenceDefinitionV1[];
  readonly graphQLCompatibility: LegacyGraphQLDocumentCompatibilityV1 | null;
  readonly types: readonly NamedGraphQLTypeDefinitionV1[];
  readonly state: {
    readonly global: NonEmptyStateDefinitionV1;
    readonly local: StateDefinitionV1;
  };
  readonly modules: readonly {
    readonly id: string;
    readonly key: string;
    readonly name: string;
    readonly description: string | null;
    readonly operations: readonly DocumentModelOperationDefinitionV1[];
  }[];
  readonly changeLog: readonly string[];
};

export type DocumentModelDefinitionV1 = {
  readonly kind: "powerhouse.document-model";
  readonly formatVersion: 1;
  readonly compatibility: {
    readonly identity: "derived-v1" | "explicit-legacy";
    readonly scalarCoercion: "document-engineering-1.40";
    readonly serialization: "canonical-v1" | "explicit-legacy";
  };
  readonly model: {
    readonly documentType: string;
    readonly graphQLName: string;
    readonly name: string;
    readonly description: string;
    readonly extension: string;
    readonly author: {
      readonly name: string;
      readonly website: string | null;
    };
  };
  readonly specifications: readonly DocumentModelSpecificationDefinitionV1[];
};

export type SubgraphAccessDefinitionV1 =
  | { readonly kind: "public" }
  | { readonly kind: "manual" }
  | {
      readonly kind: "document-read";
      readonly argument: string;
    };

export type SubgraphEntryDefinitionV1 =
  | {
      readonly kind: "query" | "mutation" | "subscription";
      readonly key: string;
      readonly fieldName: string;
      readonly description: string | null;
      readonly args: readonly InputFieldDefinitionV1[];
      readonly returns: TypeReferenceDefinitionV1;
      readonly access: SubgraphAccessDefinitionV1;
      readonly compatibilityName: string | null;
    }
  | {
      readonly kind: "field";
      readonly target: {
        readonly typeName: string;
        readonly fieldName: string;
      };
      readonly access: SubgraphAccessDefinitionV1;
    }
  | {
      readonly kind: "resolveType";
      readonly typeName: string;
    }
  | {
      readonly kind: "isTypeOf";
      readonly typeName: string;
    };

export type ResolverCoordinateDefinitionV1 = {
  readonly typeName: string;
  readonly fieldName: string | null;
  readonly resolverKind:
    | "field"
    | "subscribe"
    | "resolve"
    | "resolveType"
    | "isTypeOf"
    | "enum"
    | "scalar";
};

export type SubgraphDefinitionV1 = {
  readonly kind: "powerhouse.subgraph";
  readonly formatVersion: 1;
  readonly name: string;
  readonly compositionPolicy: "host-current";
  readonly federationProfile: "host-current";
} & (
  | {
      readonly schemaKind: "typed";
      readonly hasSubscriptions: boolean;
      readonly types: readonly NamedGraphQLTypeDefinitionV1[];
      readonly entries: readonly SubgraphEntryDefinitionV1[];
      readonly scalars: readonly SubgraphScalarReferenceDefinitionV1[];
    }
  | {
      readonly schemaKind: "graphql-ast-compat";
      readonly hasSubscriptions: boolean | null;
      readonly document: LocationFreeGraphQLDocumentNodeV1;
      readonly resolverCoordinates: readonly ResolverCoordinateDefinitionV1[];
      readonly access: "manual";
    }
);
