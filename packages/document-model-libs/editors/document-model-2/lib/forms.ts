import { pascalCase } from "change-case";
import {
  GraphQLSchema,
  isScalarType,
  isObjectType,
  isEnumType,
  isInterfaceType,
  ObjectTypeDefinitionNode,
  Kind,
  GraphQLType,
  print,
} from "graphql";
import { AddTypeFormValues } from "../components/form/add-type-form";
import { updateDoc, docStore } from "../store/docStore";
import { moduleStore } from "../store/moduleStore";
import { DocumentActionHandlers } from "../types/document";
import { Scope } from "../types/modules";
import {
  makeFieldDefinitionNode,
  makeOperationNodesForStateField,
} from "./schemas";
import { LOCAL_STATE_DOC_ID, STATE_DOC_ID } from "../constants/documents";

export function getTypeOptions(schema: GraphQLSchema) {
  // Default GraphQL scalar types
  const defaultScalarTypes = ["String", "Int", "Float", "Boolean", "ID"];

  // Get types from the current schema
  const typeMap = schema.getTypeMap();

  // Collect user-defined types, excluding "Query" and "State"
  const userDefinedTypes = Object.values(typeMap)
    .filter((type) => {
      if (type.name.startsWith("__")) return false; // Exclude introspection types
      if (["Query", "State"].includes(type.name)) return false; // Exclude Query and State

      // Include object types, enum types, scalar types (user-defined), and interface types
      return (
        isScalarType(type) ||
        isObjectType(type) ||
        isEnumType(type) ||
        isInterfaceType(type)
      );
    })
    .map((type) => type.name)
    .filter((typeName) => !defaultScalarTypes.includes(typeName)); // Exclude default scalar types if duplicated

  // Combine default scalar types and user-defined types
  const typeOptions = [...defaultScalarTypes, ...userDefinedTypes];

  // Remove duplicates
  const uniqueTypeOptions = Array.from(new Set(typeOptions));

  return uniqueTypeOptions;
}

export function onSubmitAddType(
  values: AddTypeFormValues,
  schema: GraphQLSchema,
) {
  const typeName = pascalCase(values.name.replace(/^\s+|\s+$/g, "_"));
  const fields = values.fields.map((field) =>
    makeFieldDefinitionNode({
      fieldName: field.name,
      fieldType: field.type,
      schema,
      isList: field.isList,
      isNonNull: field.isNonNull,
    }),
  );
  const newObjectType: ObjectTypeDefinitionNode = {
    kind: Kind.OBJECT_TYPE_DEFINITION,
    name: { kind: Kind.NAME, value: typeName },
    fields,
  };

  const sdlString = print(newObjectType);
  const globalStateDoc = docStore.state.get(STATE_DOC_ID)!;
  const newDoc = globalStateDoc + "\n\n" + sdlString;
  updateDoc(STATE_DOC_ID, newDoc);
}

// export async function onSubmitAddStateField(
//   values: AddStateFieldFormValues,
//   schema: GraphQLSchema
// ) {
//   const fieldName = NoWhitespaceSchema.parse(values.name);
//   const fieldType = values.type;
//   const isList = !!values.isList;
//   const isNonNull = !!values.isNonNull;
//   const isGlobal = values.scope === "global";
//   const nodeName = isGlobal ? "State" : "LocalState";
//   const docId = isGlobal ? STATE_DOC_ID : LOCAL_STATE_DOC_ID;
//   const doc = docStore.state.get(docId);
//   if (doc === undefined) {
//     throw new Error(`Document with ID ${docId} not found`);
//   }
//   const newField = makeFieldDefinitionNode({
//     fieldName,
//     fieldType,
//     schema,
//     isList,
//     isNonNull,
//   });

//   const ast = parse(doc);
//   const newAst = addFieldToObjectTypeDefinition({
//     nodeName,
//     ast,
//     newField,
//   });
//   const newSdl = print(newAst);
//   updateDoc(docId, newSdl);

//   const schemaSdl = Array.from(docStore.state.values()).join("\n");

//   const inputs = makeInputsForStateField({
//     schemaSdl,
//     fieldName,
//     fieldType,
//     isNonNull,
//     isList,
//   });

//   const moduleFromStore = getModuleByName(fieldName);
//   const moduleId = moduleFromStore?.id ?? uuid();

//   if (!moduleFromStore) {
//     const name = toLowercaseSnakeCase(fieldName);
//     addModule({
//       name,
//       id: moduleId,
//       scope: values.scope,
//     });
//   }

//   for (const { operationName, node } of inputs) {
//     const doc = `# ${operationName}\n\n` + print(node);
//     addOperation(moduleId, toConstantCase(operationName), doc);
//   }
// }

export function makeGeneratedOperationNodes(args: {
  stateFieldName: string;
  stateFieldType: GraphQLType;
  scope: Scope;
}) {
  const { stateFieldName, stateFieldType, scope } = args;
  const operationNodes = makeOperationNodesForStateField({
    fieldName: stateFieldName,
    fieldType: stateFieldType,
    scope,
  });

  return operationNodes;
}
