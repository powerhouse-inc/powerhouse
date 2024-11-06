import { parse, print, visit, validate, buildSchema } from "graphql";

export function updateStateTypeNames(
  schema: string,
  oldName: string,
  newName: string,
): string {
  if (!schema) return schema;

  try {
    const ast = parse(schema);
    let hasUpdated = false;

    const updatedAst = visit(ast, {
      ObjectTypeDefinition: {
        enter(node) {
          const expectedGlobalName = `${oldName}State`;
          const expectedLocalName = `${oldName}LocalState`;

          if (
            node.name.value === expectedGlobalName ||
            node.name.value === expectedLocalName
          ) {
            hasUpdated = true;
            return {
              ...node,
              name: {
                ...node.name,
                value:
                  node.name.value === expectedGlobalName
                    ? `${newName}State`
                    : `${newName}LocalState`,
              },
            };
          }

          return node;
        },
      },
    });

    if (!hasUpdated) return schema;

    // Validate the updated schema
    const updatedSchemaStr = print(updatedAst);
    try {
      const builtSchema = buildSchema(updatedSchemaStr);
      const errors = validate(builtSchema, updatedAst);
      if (errors.length > 0) {
        console.error("Schema validation errors:", errors);
        return schema;
      }
    } catch (e) {
      console.error("Schema build error:", e);
      return schema;
    }

    return updatedSchemaStr;
  } catch (e) {
    console.error("Failed to update schema type names:", e);
    return schema;
  }
}
