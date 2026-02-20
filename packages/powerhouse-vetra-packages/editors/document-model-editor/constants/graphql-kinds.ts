export const STRING_GQL_PRIMITIVE_NAME = "String";
export const BOOLEAN_GQL_PRIMITIVE_NAME = "Boolean";
export const INT_GQL_PRIMITIVE_NAME = "Int";
export const FLOAT_GQL_PRIMITIVE_NAME = "Float";
export const ID_GQL_PRIMITIVE_NAME = "ID";

export const gqlPrimitiveNodeNamesList = [
  STRING_GQL_PRIMITIVE_NAME,
  BOOLEAN_GQL_PRIMITIVE_NAME,
  INT_GQL_PRIMITIVE_NAME,
  FLOAT_GQL_PRIMITIVE_NAME,
  ID_GQL_PRIMITIVE_NAME,
] as const;

export type GqlPrimitiveNodeNames = typeof gqlPrimitiveNodeNamesList;
export type GqlPrimitiveNodeName = GqlPrimitiveNodeNames[number];
