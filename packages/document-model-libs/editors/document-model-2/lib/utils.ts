import { snakeCase, constantCase } from "change-case";
import { ClassValue } from "class-variance-authority/types";
import {
  GraphQLType,
  isScalarType,
  isEnumType,
  isListType,
  isObjectType,
  buildASTSchema,
  parse,
  getNamedType,
  GraphQLSchema,
  isNonNullType,
  getNullableType,
} from "graphql";
import { v7 } from "uuid";
import { whitespaceRegex } from "../constants/utils";
import {
  ToLowercaseSnakeCaseSchema,
  ToConstantCaseSchema,
} from "../schemas/inputs";
import { LowercaseSnakeCase, ConstantCase } from "../types/helpers";
import { OperationType } from "../types/modules";
import { twMerge } from "tailwind-merge";
import clsx from "clsx";
import { singular } from "pluralize";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
// Function to generate minimal value for a given GraphQL type
export function getMinimalValue(type: GraphQLType, schema: GraphQLSchema) {
  const nullableType = getNullableType(type);

  if (isScalarType(nullableType)) {
    const typeName = nullableType.name;
    switch (typeName) {
      case "Int":
      case "Float":
        return 0;
      case "Boolean":
        return false;
      case "ID":
      case "String":
      default:
        return ""; // Return empty string for custom scalars and String/ID types
    }
  }

  if (isEnumType(nullableType)) {
    return nullableType.getValues()[0]?.value || null;
  }

  if (isListType(nullableType)) {
    return [];
  }

  if (isObjectType(nullableType)) {
    const result: Record<string, any> = {};
    const fields = nullableType.getFields();
    for (const fieldName in fields) {
      const field = fields[fieldName];
      result[fieldName] = getMinimalValue(field.type, schema);
    }
    return result;
  }

  // Handle other types like InterfaceType, UnionType as needed
  return null;
}

export function generateMinimalObject(schema: GraphQLSchema, typeName: string) {
  const type = schema.getType(typeName);

  if (!type || !isObjectType(type)) {
    throw new Error(
      `Type "${typeName}" is not a valid ObjectType in the schema.`,
    );
  }

  return getMinimalValue(type, schema);
}

export function replaceSpaces(s: string) {
  return s.replace(whitespaceRegex, "_");
}

export function containsSpaces(s: string) {
  return whitespaceRegex.test(s);
}

export function toLowercaseSnakeCase(value: string) {
  return ToLowercaseSnakeCaseSchema.parse(
    snakeCase(value),
  ) as LowercaseSnakeCase;
}

export function toConstantCase(value: string) {
  return ToConstantCaseSchema.parse(constantCase(value)) as ConstantCase;
}

export function makeGeneratedModuleName(stateFieldName: string) {
  return toLowercaseSnakeCase(stateFieldName);
}

export function makeGeneratedOperationName(
  operationType: OperationType,
  moduleName: string,
) {
  return toConstantCase(`${operationType}_${singular(moduleName)}`);
}

export const uuid = v7;

export function renameMapKey<T>(
  map: Map<string, T>,
  oldKey: string,
  newKey: string,
) {
  // Convert Map entries to an array
  const entries = Array.from(map.entries());

  // Modify the key where it matches oldKey
  const modifiedEntries = entries.map(([key, value]) => {
    if (key === oldKey) {
      return [newKey, value] as [string, T]; // Replace with new key
    }
    return [key, value] as [string, T]; // Keep original key
  });

  // Reconstruct a new Map with modified entries
  return new Map(modifiedEntries);
}
