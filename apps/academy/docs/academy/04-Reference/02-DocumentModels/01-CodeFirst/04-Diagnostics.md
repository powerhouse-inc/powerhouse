# Diagnostics reference

This page lists every diagnostic that the definition tooling reports, grouped by the phase that reports it.

## Diagnostic fields

Each diagnostic is a structured record. `ph model check --json` writes diagnostics as JSON, so a script or an agent can read them without parsing text.

| Field | Meaning |
| ----- | ------- |
| `code` | A stable identifier, such as `PH-DM-DECLARATION-INVALID`. |
| `severity` | `error` or `warning`. |
| `phase` | The check that found the problem. |
| `source` | The configured source that the diagnostic is about, when there is one. |
| `definition` | The model or subgraph that the diagnostic is about. |
| `path` | The location inside the declaration. |
| `message` | A description of the problem. |
| `expected`, `received` | The value the tool expected and the value it found, when these apply. |
| `repair` | One instruction that fixes the problem. |
| `related` | Other locations that help explain the problem. For example, where a duplicate ID was first used. |

`path` is a location inside the declaration, not a position in a file. A diagnostic has the same `path` for a declaration written in TypeScript and for one read from a stored specification.

## Severity

An `error` makes the report `invalid`, and `ph model check` exits with code `1`. A `warning` alone does not change the exit code. To make warnings fail the check, pass `--warnings-as-errors`. Each diagnostic keeps its own severity.

## Example

```json
{
  "code": "PH-DM-DECLARATION-INVALID",
  "severity": "error",
  "phase": "definition",
  "definition": {
    "kind": "document-model",
    "key": "acme/todo",
    "version": 1
  },
  "path": ["modules", "0", "operations", "0", "key"],
  "message": "Operation key \"setPHID\" derives creator key \"setPhid\", so the typed and the runtime action creator keys would differ.",
  "expected": "setPhid",
  "received": "setPHID",
  "repair": "Rename the operation to \"setPhid\"."
}
```

## `configuration` phase

Reads `powerhouse.config.json` and its `definitionSources` field.

| Code | Severity | Meaning |
| ---- | -------- | ------- |
| `PH-CONFIG-DUPLICATE-SOURCE` | error | Two entries point to the same module and export path. |
| `PH-CONFIG-SOURCE-INVALID` | error | A specifier or an export pointer is malformed. |
| `PH-CONFIG-SOURCE-OUTSIDE-PACKAGE` | error | A source path or a symlink target points outside the package root. |
| `PH-CONFIG-SOURCES-MISSING` | error | No definition sources are selected, or the selected list is empty. |
| `PH-CONFIG-VERSION-UNSUPPORTED` | error | `definitionSources.formatVersion` is not a version this release supports. |

## `typecheck` phase

Compiles the package's TypeScript before the tool imports any source.

| Code | Severity | Meaning |
| ---- | -------- | ------- |
| `PH-PKG-TYPECHECK-FAILED` | error | The TypeScript build of the release profile failed. |

## `import` phase

Imports each configured source module.

| Code | Severity | Meaning |
| ---- | -------- | ------- |
| `PH-IMPORT-FAILED` | error | A configured source could not be imported. Sources that do not depend on it are still checked. |

## `definition` phase

Compiles each declaration into a structured definition.

| Code | Severity | Meaning |
| ---- | -------- | ------- |
| `PH-DEF-ENUM-VALUES-INVALID` | error | An enum has no values, a repeated value, or a reserved value. |
| `PH-DEF-FIELD-INVALID` | error | A field holds something that is neither a field use nor a named type. |
| `PH-DEF-FIELD-OPTION-UNSUPPORTED` | error | A field use has a validation option other than `required`. |
| `PH-DEF-IMPLEMENTS-INVALID` | error | An object implements something that is not a `ph.interface`, or lists the same interface twice. |
| `PH-DEF-NAME-INVALID` | error | A type, field, or enum value name is not a valid GraphQL name, or is a reserved name. |
| `PH-DEF-OPTION-INVALID` | error | A builder option is malformed. For example, it has the wrong type, it is a getter, it uses a symbol key, it is not a plain object, or it sets a default to `undefined`. |
| `PH-DEF-REFERENCE-TARGET-INVALID` | error | The argument of `ph.ref` is not a named type. For example, it is a field use, another reference, `undefined`, or an input with no name. |
| `PH-DEF-TYPE-AS-FIELD` | error | A named type is used as a field without `ph.ref`. |
| `PH-DEF-UNION-MEMBERS-INVALID` | error | A union has no members, a repeated member, or a member that is not a `ph.object`. |
| `PH-DM-COMPATIBILITY-INVALID` | error | The compatibility data is malformed, or it does not match the declaration. |
| `PH-DM-DECLARATION-INVALID` | error | A part of a model declaration is missing, malformed, or not supported, or was not created by the builder functions. The part can be a model, module, operation, error, example, version, or family. |
| `PH-DM-DEFAULT-UNSUPPORTED` | error | A field of the document state or of an action input declares a GraphQL default value. |
| `PH-DM-DUPLICATE-ACTION` | error | Two operations produce the same stored action type. |
| `PH-DM-DUPLICATE-NAME` | error | Two declarations produce the same module name, GraphQL type name, or action creator name. |
| `PH-DM-IDENTITY-INVALID` | error | An ID in the declaration is malformed, or two declarations produce the same ID. |
| `PH-DM-IDENTITY-REUSED` | warning | The installed stored specification already uses one ID for two declarations. You cannot fix this in your package, because a change would alter stored data. |
| `PH-DM-INITIAL-VALUE-INVALID` | error | The initial value of a scope cannot be stored as a JSON string, or the state validator of that scope rejects it. |
| `PH-DM-SCOPE-UNSUPPORTED` | error | A definition uses a scope other than `global` or `local`. |
| `PH-DM-STATE-ROOT-INVALID` | error | A required state root type is missing, is not an object, or has the wrong name. |
| `PH-DM-TYPE-POSITION-INVALID` | error | An input type is used where an output type is expected, or an output type where an input type is expected. |
| `PH-SCALAR-AUTHOR-DECLARATION-UNSUPPORTED` | error | A definition source exports a scalar that `defineScalar` did not create, or exports a catalog scalar as its own. |
| `PH-SCALAR-DECLARATION-INVALID` | error | A scalar declaration has an invalid name, description, validator, or coercion. |
| `PH-SCALAR-FACTORY-AS-FIELD` | error | A scalar builder is used as a field without being called. |
| `PH-SCALAR-ZERO-VALUE-INVALID` | error | A scalar has no zero value, or its own coercion rejects its zero value. |
| `PH-SG-COMPUTED-FIELD-INVALID` | error | A computed field is malformed, has no subgraph entry, has two entries, or has an entry but no type declares the field. |
| `PH-SG-DEFINITION-INVALID` | error | A published subgraph definition does not have the expected shape. |
| `PH-SG-ENTRY-INVALID` | error | A subgraph entry is malformed, was not created by the builder functions, or has no resolver where the builder requires one. |

## `composition` phase

Builds the host GraphQL schema from all registered models and subgraphs.

| Code | Severity | Meaning |
| ---- | -------- | ------- |
| `PH-GQL-COORDINATE-OWNED` | warning | Two subgraphs define the same field on the same type. |
| `PH-GQL-FEDERATION-UNSUPPORTED` | error | A code-first subgraph uses Apollo Federation 2 features. This version does not support them. |
| `PH-GQL-SHARED-DEFINITION-MISMATCH` | warning | Two subgraphs define a type with the same name but a different shape. |
| `PH-SCALAR-RESOLVER-SHADOWED` | warning | A resolver that you wrote uses the name of a catalog scalar. |
| `PH-SCALAR-UNREGISTERED` | warning | The SDL uses a scalar that the catalog has no entry for. |
| `PH-SG-SCHEMA-INVALID` | error | The subgraph schema, with the types that the host adds, does not build or is not valid. |

## `package` phase

Checks the package as a whole, or a release candidate.

| Code | Severity | Meaning |
| ---- | -------- | ------- |
| `PH-PKG-DEFINITION-UNINSPECTABLE` | error | The tool cannot read a selected export without running code. For example, the export is a getter or a Proxy. |
| `PH-PKG-DEFINITION-UNRECOGNIZED` | error | A selected source exports no compiled definition. |
| `PH-PKG-LOGICAL-COLLISION` | error | Two different exports in the package have the same model, upgrade manifest, or subgraph key. |
| `PH-PKG-PACKED-CONSUMER-FAILED` | error | A test install of the packed package could not import it in Node or in a browser. |
| `PH-PKG-RELEASE-EVIDENCE-MISSING` | error | A release check ran without the required typecheck or the test install of the packed package. |
| `PH-SCALAR-DUPLICATE-NAME` | error | Two scalar declarations use the same name. This includes a catalog scalar declared twice, a package scalar with a catalog or built-in name, and two different package scalars. |

## `authorization` phase

Checks authorization rules in a declaration.

| Code | Severity | Meaning |
| ---- | -------- | ------- |
| `PH-AUTH-UNSUPPORTED` | error | A document model declares authorization rules. This version does not support them. |

## Reserved codes

The catalog defines these codes, but no check reports them in this release.

| Code | Phase | Severity | Meaning |
| ---- | ----- | -------- | ------- |
| `PH-REPLAY-DIVERGENCE` | `replay` | error | A recorded history replays to different results in the schema-first and code-first versions of a model. |
| `PH-SCALAR-COERCION-NORMALIZES` | `definition` | warning | A strict coercion returns a value that differs from the input it accepted. |
| `PH-SCALAR-POSITION-UNSUPPORTED` | `definition` | warning | A later validation profile rejects the scalar in a stored position. |
| `PH-SCALAR-VALUE-NOT-JSON` | `definition` | warning | A strict scalar that is stored accepts a value that is not JSON. |
