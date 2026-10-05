export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type Sha256Digest = `sha256:${string}`;

export type DefinitionSource = {
  readonly specifier: `./${string}`;
  readonly exportPath?: readonly string[];
};

export type DefinitionDiagnosticSeverity = "error" | "warning";

export type DefinitionDiagnosticPhase =
  | "configuration"
  | "import"
  | "definition"
  | "composition"
  | "authorization"
  | "typecheck"
  | "package"
  | "replay";

export type DefinitionKind =
  | "document-model"
  | "subgraph"
  | "scalar"
  | "package";

export type DefinitionRef = {
  readonly kind: DefinitionKind;
  readonly key: string;
  readonly version?: number;
};

export type DefinitionPath = readonly (string | number)[];

export type DefinitionRelatedLocation = {
  readonly source?: DefinitionSource;
  readonly path: DefinitionPath;
  readonly message: string;
};

export type DefinitionDiagnostic = {
  readonly code: `PH-${string}`;
  readonly severity: DefinitionDiagnosticSeverity;
  readonly phase: DefinitionDiagnosticPhase;
  readonly source?: DefinitionSource;
  readonly definition?: DefinitionRef;
  readonly path: DefinitionPath;
  readonly message: string;
  readonly expected?: string;
  readonly received?: string;
  readonly repair: string;
  readonly related?: readonly DefinitionRelatedLocation[];
};

export type GraphQLNameNode = {
  readonly kind: "Name";
  readonly value: string;
};

export type GraphQLNamedTypeNode = {
  readonly kind: "NamedType";
  readonly name: GraphQLNameNode;
};

export type GraphQLListTypeNode = {
  readonly kind: "ListType";
  readonly type: GraphQLTypeNode;
};

export type GraphQLNonNullTypeNode = {
  readonly kind: "NonNullType";
  readonly type: GraphQLNamedTypeNode | GraphQLListTypeNode;
};

export type GraphQLTypeNode =
  | GraphQLNamedTypeNode
  | GraphQLListTypeNode
  | GraphQLNonNullTypeNode;

export type GraphQLStringValueNode = {
  readonly kind: "StringValue";
  readonly value: string;
  readonly block?: boolean;
};

export type GraphQLConstValueNode =
  | { readonly kind: "IntValue"; readonly value: string }
  | { readonly kind: "FloatValue"; readonly value: string }
  | GraphQLStringValueNode
  | { readonly kind: "BooleanValue"; readonly value: boolean }
  | { readonly kind: "NullValue" }
  | { readonly kind: "EnumValue"; readonly value: string }
  | {
      readonly kind: "ListValue";
      readonly values: readonly GraphQLConstValueNode[];
    }
  | {
      readonly kind: "ObjectValue";
      readonly fields: readonly GraphQLObjectFieldNode[];
    };

export type GraphQLObjectFieldNode = {
  readonly kind: "ObjectField";
  readonly name: GraphQLNameNode;
  readonly value: GraphQLConstValueNode;
};

export type GraphQLArgumentNode = {
  readonly kind: "Argument";
  readonly name: GraphQLNameNode;
  readonly value: GraphQLConstValueNode;
};

export type GraphQLDirectiveNode = {
  readonly kind: "Directive";
  readonly name: GraphQLNameNode;
  readonly arguments: readonly GraphQLArgumentNode[];
};

export type GraphQLInputValueDefinitionNode = {
  readonly kind: "InputValueDefinition";
  readonly description?: GraphQLStringValueNode;
  readonly name: GraphQLNameNode;
  readonly type: GraphQLTypeNode;
  readonly defaultValue?: GraphQLConstValueNode;
  readonly directives: readonly GraphQLDirectiveNode[];
};

export type GraphQLFieldDefinitionNode = {
  readonly kind: "FieldDefinition";
  readonly description?: GraphQLStringValueNode;
  readonly name: GraphQLNameNode;
  readonly arguments: readonly GraphQLInputValueDefinitionNode[];
  readonly type: GraphQLTypeNode;
  readonly directives: readonly GraphQLDirectiveNode[];
};

export type GraphQLEnumValueDefinitionNode = {
  readonly kind: "EnumValueDefinition";
  readonly description?: GraphQLStringValueNode;
  readonly name: GraphQLNameNode;
  readonly directives: readonly GraphQLDirectiveNode[];
};

type GraphQLNamedDefinitionNode = {
  readonly description?: GraphQLStringValueNode;
  readonly name: GraphQLNameNode;
  readonly directives: readonly GraphQLDirectiveNode[];
};

export type GraphQLScalarTypeDefinitionNode = GraphQLNamedDefinitionNode & {
  readonly kind: "ScalarTypeDefinition";
};

export type GraphQLObjectTypeDefinitionNode = GraphQLNamedDefinitionNode & {
  readonly kind: "ObjectTypeDefinition";
  readonly interfaces: readonly GraphQLNamedTypeNode[];
  readonly fields: readonly GraphQLFieldDefinitionNode[];
};

export type GraphQLInterfaceTypeDefinitionNode = GraphQLNamedDefinitionNode & {
  readonly kind: "InterfaceTypeDefinition";
  readonly interfaces: readonly GraphQLNamedTypeNode[];
  readonly fields: readonly GraphQLFieldDefinitionNode[];
};

export type GraphQLUnionTypeDefinitionNode = GraphQLNamedDefinitionNode & {
  readonly kind: "UnionTypeDefinition";
  readonly types: readonly GraphQLNamedTypeNode[];
};

export type GraphQLEnumTypeDefinitionNode = GraphQLNamedDefinitionNode & {
  readonly kind: "EnumTypeDefinition";
  readonly values: readonly GraphQLEnumValueDefinitionNode[];
};

export type GraphQLInputObjectTypeDefinitionNode =
  GraphQLNamedDefinitionNode & {
    readonly kind: "InputObjectTypeDefinition";
    readonly fields: readonly GraphQLInputValueDefinitionNode[];
  };

export type GraphQLOperationTypeDefinitionNode = {
  readonly kind: "OperationTypeDefinition";
  readonly operation: "query" | "mutation" | "subscription";
  readonly type: GraphQLNamedTypeNode;
};

export type GraphQLSchemaDefinitionNode = {
  readonly kind: "SchemaDefinition";
  readonly description?: GraphQLStringValueNode;
  readonly directives: readonly GraphQLDirectiveNode[];
  readonly operationTypes: readonly GraphQLOperationTypeDefinitionNode[];
};

export type GraphQLDirectiveDefinitionNode = {
  readonly kind: "DirectiveDefinition";
  readonly description?: GraphQLStringValueNode;
  readonly name: GraphQLNameNode;
  readonly arguments: readonly GraphQLInputValueDefinitionNode[];
  readonly repeatable: boolean;
  readonly locations: readonly GraphQLNameNode[];
};

export type GraphQLTypeSystemDefinitionNode =
  | GraphQLSchemaDefinitionNode
  | GraphQLScalarTypeDefinitionNode
  | GraphQLObjectTypeDefinitionNode
  | GraphQLInterfaceTypeDefinitionNode
  | GraphQLUnionTypeDefinitionNode
  | GraphQLEnumTypeDefinitionNode
  | GraphQLInputObjectTypeDefinitionNode
  | GraphQLDirectiveDefinitionNode;

export type GraphQLTypeSystemExtensionNode =
  | (Omit<GraphQLSchemaDefinitionNode, "kind" | "description"> & {
      readonly kind: "SchemaExtension";
    })
  | (Omit<GraphQLScalarTypeDefinitionNode, "kind" | "description"> & {
      readonly kind: "ScalarTypeExtension";
    })
  | (Omit<GraphQLObjectTypeDefinitionNode, "kind" | "description"> & {
      readonly kind: "ObjectTypeExtension";
    })
  | (Omit<GraphQLInterfaceTypeDefinitionNode, "kind" | "description"> & {
      readonly kind: "InterfaceTypeExtension";
    })
  | (Omit<GraphQLUnionTypeDefinitionNode, "kind" | "description"> & {
      readonly kind: "UnionTypeExtension";
    })
  | (Omit<GraphQLEnumTypeDefinitionNode, "kind" | "description"> & {
      readonly kind: "EnumTypeExtension";
    })
  | (Omit<GraphQLInputObjectTypeDefinitionNode, "kind" | "description"> & {
      readonly kind: "InputObjectTypeExtension";
    });

export type LocationFreeGraphQLDocumentNode = {
  readonly kind: "Document";
  readonly definitions: readonly (
    | GraphQLTypeSystemDefinitionNode
    | GraphQLTypeSystemExtensionNode
  )[];
};

export type SchemaFirstGraphQLDocumentCompatibility = {
  readonly kind: "graphql-ast-v1";
  readonly document: LocationFreeGraphQLDocumentNode;
  readonly preserveDefinitionOrder: true;
};

export type GraphQLBuiltInScalarName =
  | "ID"
  | "String"
  | "Boolean"
  | "Int"
  | "Float";

export type PowerhouseScalarName =
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

export type ScalarName = GraphQLBuiltInScalarName | PowerhouseScalarName;

export type ScalarRepresentation =
  | "string"
  | "number"
  | "boolean"
  | "json-object"
  | "json"
  | "opaque";

export type ScalarZero =
  | { readonly kind: "value"; readonly value: JsonValue }
  | { readonly kind: "none"; readonly reason: string };

export type ScalarValidationProfile =
  | "document-engineering-1.40"
  | "catalog-v1";

export type ScalarGraphQLProfile = "legacy-graphql-default-v1" | "catalog-v1";

export type ScalarDefinition = {
  readonly kind: "powerhouse.scalar";
  readonly formatVersion: 1;
  /**
   * Any GraphQL name. A catalog scalar uses a `PowerhouseScalarName`; a
   * package scalar uses any other name that is not a GraphQL built-in.
   */
  readonly name: string;
  readonly representation: ScalarRepresentation;
  readonly persistable: boolean;
  readonly description: string;
  readonly zero: ScalarZero;
  readonly coercion: { readonly source: "derived" | "explicit" };
  readonly coercionProfile: ScalarValidationProfile;
};

export type ScalarTypeReferenceDefinition = {
  readonly kind: "scalar";
  /**
   * A `ScalarName`, or a package scalar that the enclosing definition's
   * `scalars` list declares.
   */
  readonly name: string;
  readonly required: boolean;
};

export type NamedTypeReferenceDefinition = {
  readonly kind: "named";
  readonly name: string;
  readonly required: boolean;
};

export type ListTypeReferenceDefinition = {
  readonly kind: "list";
  readonly required: boolean;
  readonly item: TypeReferenceDefinition;
};

export type TypeReferenceDefinition =
  | ScalarTypeReferenceDefinition
  | NamedTypeReferenceDefinition
  | ListTypeReferenceDefinition;

export type DirectiveUseDefinition = {
  readonly name: string;
  readonly arguments: readonly {
    readonly name: string;
    readonly value: JsonValue;
  }[];
};

export type FieldDefinition = {
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly deprecated: string | null;
  readonly args?: readonly InputFieldDefinition[];
  readonly type: TypeReferenceDefinition;
  readonly directives?: readonly DirectiveUseDefinition[];
};

export type InputFieldDefinition = Omit<FieldDefinition, "args"> &
  ({ readonly defaultValue?: never } | { readonly defaultValue: JsonValue });

export type EnumValueDefinition = {
  readonly name: string;
  readonly description: string | null;
  readonly deprecated: string | null;
  readonly directives?: readonly DirectiveUseDefinition[];
};

export type EnumTypeDefinition = {
  readonly kind: "enum";
  readonly name: string;
  readonly description: string | null;
  readonly values: readonly EnumValueDefinition[];
};

export type ObjectTypeDefinition = {
  readonly kind: "object";
  readonly name: string;
  readonly description: string | null;
  readonly implements?: readonly string[];
  readonly fields: readonly FieldDefinition[];
};

export type InterfaceTypeDefinition = {
  readonly kind: "interface";
  readonly name: string;
  readonly description: string | null;
  readonly implements?: readonly string[];
  readonly fields: readonly FieldDefinition[];
};

export type InputTypeDefinition = {
  readonly kind: "input";
  readonly name: string;
  readonly description: string | null;
  readonly unknownKeys: "preserve" | "reject";
  readonly fields: readonly InputFieldDefinition[];
};

export type UnionTypeDefinition = {
  readonly kind: "union";
  readonly name: string;
  readonly description: string | null;
  readonly members: readonly string[];
};

export type NamedGraphQLTypeDefinition =
  | EnumTypeDefinition
  | ObjectTypeDefinition
  | InterfaceTypeDefinition
  | InputTypeDefinition
  | UnionTypeDefinition;

type CatalogScalarImplementationReference = {
  [Name in PowerhouseScalarName]: {
    readonly name: Name;
    readonly implementation: `powerhouse.catalog#${Name}`;
  };
}[PowerhouseScalarName];

export type CatalogScalarReferenceDefinition =
  CatalogScalarImplementationReference & {
    readonly coercionProfile: "document-engineering-1.40";
  };

/**
 * The package that ships the definition declares this scalar with `defineScalar`.
 */
export type PackageScalarReferenceDefinition = {
  readonly name: string;
  readonly implementation: `package#${string}`;
  readonly coercionProfile: "document-engineering-1.40";
  readonly definition: ScalarDefinition;
};

export type DocumentScalarReferenceDefinition =
  | CatalogScalarReferenceDefinition
  | PackageScalarReferenceDefinition;

export type DefinitionExample = {
  readonly id: string;
  readonly key: string;
  readonly value: string;
};

export type MaterializedStateDefinition = {
  readonly schema: string;
  readonly initialValue: string;
  readonly examples: readonly Omit<DefinitionExample, "key">[];
};

export type NonEmptyStateDefinition = {
  readonly root: NamedTypeReferenceDefinition;
  readonly initialValue: JsonValue;
  readonly examples: readonly DefinitionExample[];
  readonly unknownKeys: "preserve";
  readonly materialized: MaterializedStateDefinition;
};

export type EmptyLocalStateDefinition = {
  readonly root: null;
  readonly initialValue: Readonly<Record<string, never>>;
  readonly examples: readonly DefinitionExample[];
  readonly unknownKeys: "preserve";
  readonly materialized: MaterializedStateDefinition & {
    readonly schema: "";
  };
};

export type StateDefinition =
  | NonEmptyStateDefinition
  | EmptyLocalStateDefinition;

export type CompiledErrorDefinition = {
  readonly id: string;
  readonly key: string;
  readonly code: string | null;
  readonly name: string | null;
  readonly description: string | null;
  readonly template: string | null;
};

export type DocumentModelOperationDefinition = {
  readonly id: string;
  readonly key: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly actionType: string;
  readonly creatorKey: string;
  readonly scope: "global" | "local";
  readonly input: InputTypeDefinition | null;
  readonly errors: readonly CompiledErrorDefinition[];
  readonly examples: readonly DefinitionExample[];
  readonly template: string | null;
  readonly reducer: string | null;
};

export type DocumentModelModuleDefinition = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly operations: readonly DocumentModelOperationDefinition[];
};

export type DocumentModelSpecificationDefinition = {
  readonly version: number;
  readonly scalars: readonly DocumentScalarReferenceDefinition[];
  readonly graphQLCompatibility: SchemaFirstGraphQLDocumentCompatibility | null;
  readonly types: readonly NamedGraphQLTypeDefinition[];
  readonly state: {
    readonly global: NonEmptyStateDefinition;
    readonly local: StateDefinition;
  };
  readonly modules: readonly DocumentModelModuleDefinition[];
  readonly changeLog: readonly string[];
};

export type DocumentModelDefinition = {
  readonly kind: "powerhouse.document-model";
  readonly formatVersion: 1;
  readonly compatibility: {
    readonly identity: "derived-v1" | "explicit-schema-first";
    readonly scalarCoercion: "document-engineering-1.40";
    readonly serialization: "canonical-v1" | "explicit-schema-first";
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
  readonly specifications: readonly DocumentModelSpecificationDefinition[];
};

export type DefinitionCheckProfile = "edit" | "release";

export type DefinitionSourcesConfig = {
  readonly formatVersion: 1;
} & (
  | {
      readonly mode: "code-first";
      readonly entries: readonly [DefinitionSource, ...DefinitionSource[]];
    }
  | { readonly mode: "schema-first"; readonly entries?: never }
);

export type DefinitionCheckRequest = {
  readonly formatVersion: 1;
  readonly profile: DefinitionCheckProfile;
  readonly warningsAsErrors?: boolean;
} & (
  | {
      readonly sourceMode: "code-first";
      readonly sourceOrigin: "config" | "cli" | "request";
      readonly sources: readonly [DefinitionSource, ...DefinitionSource[]];
    }
  | {
      readonly sourceMode: "schema-first";
      readonly sourceOrigin: "config";
      readonly sources?: never;
    }
);

export type DefinitionCompatibilitySelection = {
  readonly identity: "derived-v1" | "explicit-schema-first";
  readonly serialization: "canonical-v1" | "explicit-schema-first";
  readonly paths: {
    readonly ids: readonly string[];
    readonly names: readonly string[];
    readonly serialization: readonly string[];
  };
};

export type DefinitionCheckReport = {
  readonly kind: "powerhouse.definition-check";
  readonly formatVersion: 1;
  readonly profile: DefinitionCheckProfile;
  readonly sourceSet: {
    readonly mode: "code-first" | "schema-first";
    readonly origin: "config" | "cli" | "request";
    readonly digest: Sha256Digest;
    readonly sources: readonly DefinitionSource[];
  };
  readonly definitions: readonly (DefinitionRef & {
    readonly digest?: Sha256Digest;
    readonly source: DefinitionSource;
    readonly compatibility?: DefinitionCompatibilitySelection;
  })[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
  readonly summary: {
    readonly errors: number;
    readonly warnings: number;
  };
} & (
  | {
      readonly status: "ok" | "invalid" | "failed";
      readonly skipReason?: never;
    }
  | {
      readonly status: "skipped";
      readonly skipReason: "explicit-schema-first-mode";
    }
);

/**
 * `fieldName` is `null` for a resolver bound to a type rather than a field.
 */
export type ResolverCoordinateDefinition = {
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

/**
 * The compiler supplies this marker. Resolvers perform their own authorization.
 */
export type SubgraphEntryAccess = { readonly kind: "manual" };

type SubgraphRootEntryBase = {
  /** The author's key, which is stable across a GraphQL name change. */
  readonly key: string;
  readonly fieldName: string;
  readonly description: string | null;
  readonly deprecated: string | null;
  readonly args: readonly InputFieldDefinition[];
  readonly returns: TypeReferenceDefinition;
  readonly access: SubgraphEntryAccess;
};

export type SubgraphEntryDefinition =
  | ({ readonly kind: "query" } & SubgraphRootEntryBase)
  | ({ readonly kind: "mutation" } & SubgraphRootEntryBase)
  | ({ readonly kind: "subscription" } & SubgraphRootEntryBase)
  | {
      readonly kind: "computed-field";
      readonly typeName: string;
      readonly fieldName: string;
      readonly access: SubgraphEntryAccess;
    }
  | {
      readonly kind: "resolve-type";
      readonly typeName: string;
      readonly access: SubgraphEntryAccess;
    }
  | {
      readonly kind: "is-type-of";
      readonly typeName: string;
      readonly access: SubgraphEntryAccess;
    };

export type SubgraphScalarReferenceDefinition =
  | (CatalogScalarImplementationReference & {
      readonly graphQLProfile: "legacy-graphql-default-v1";
    })
  | {
      readonly name: string;
      readonly implementation: `package#${string}`;
      readonly graphQLProfile: "declared-coercion-v1";
      readonly definition: ScalarDefinition;
    };

export type SubgraphDefinitionBase = {
  readonly kind: "powerhouse.subgraph";
  readonly formatVersion: 1;
  /** The instance and route segment name, not a new global identity. */
  readonly name: string;
  readonly compositionPolicy: "host-current";
  readonly federationProfile: "host-current";
};

export type SubgraphDefinition = SubgraphDefinitionBase &
  (
    | {
        readonly schemaKind: "typed";
        readonly hasSubscriptions: boolean;
        readonly types: readonly NamedGraphQLTypeDefinition[];
        readonly entries: readonly SubgraphEntryDefinition[];
        readonly scalars: readonly SubgraphScalarReferenceDefinition[];
        /**
         * Every emitted definition name appears once, including roots and
         * scalars. This order preserves the authored schema's print order.
         */
        readonly definitionOrder: readonly string[];
      }
    | {
        readonly schemaKind: "graphql-ast-compat";
        /**
         * `null` records runtime `undefined`. Both `null` and `false` disable
         * subscriptions, but compatibility must preserve their distinct values.
         */
        readonly hasSubscriptions: boolean | null;
        readonly document: LocationFreeGraphQLDocumentNode;
        readonly resolverCoordinates: readonly ResolverCoordinateDefinition[];
        readonly access: "manual";
      }
  );
