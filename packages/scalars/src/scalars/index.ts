// namespace imports -- DO NOT REMOVE OR EDIT THIS COMMENT
import * as AmountTokens from "./AmountTokens";
import * as EthereumAddress from "./EthereumAddress";
import * as AmountPercentage from "./AmountPercentage";
import * as EmailAddress from "./EmailAddress";

// export types -- DO NOT REMOVE OR EDIT THIS COMMENT
export type { ScalarType as AmountTokensScalarType } from "./AmountTokens";
export type { ScalarType as EthereumAddressScalarType } from "./EthereumAddress";
export type { ScalarType as AmountPercentageScalarType } from "./AmountPercentage";
export type { ScalarType as EmailAddressScalarType } from "./EmailAddress";

export {
  // export object -- DO NOT REMOVE OR EDIT THIS COMMENT
  AmountTokens,
  EthereumAddress,
  AmountPercentage,
  EmailAddress,
};

export const resolvers = {
  // export resolvers -- DO NOT REMOVE OR EDIT THIS COMMENT
  AmountTokens: AmountTokens.scalar,
  EthereumAddress: EthereumAddress.scalar,
  AmountPercentage: AmountPercentage.scalar,
  EmailAddress: EmailAddress.scalar,
};

export const typeDefs = [
  // export typedefs -- DO NOT REMOVE OR EDIT THIS COMMENT
  AmountTokens.typedef,
  EthereumAddress.typedef,
  AmountPercentage.typedef,
  EmailAddress.typedef,
  "scalar Date",
  "scalar DateTime",
  "scalar URL",
  "scalar Amount_Money",
  "scalar OLabel",
  "scalar Currency",
  "scalar PHID",
  "scalar OID",
];

export const generatorTypeDefs = {
  // export generator typedefs -- DO NOT REMOVE OR EDIT THIS COMMENT
  [AmountTokens.config.name]: AmountTokens.type,
  [EthereumAddress.config.name]: EthereumAddress.type,
  [EmailAddress.config.name]: EmailAddress.type,
  [AmountPercentage.config.name]: AmountPercentage.type,
  Date: "string",
  DateTime: "string",
  URL: "string",
  Amount_Money: "number",
  OLabel: "string",
  Currency: "string",
  PHID: "string",
  OID: "string",
};

export const validationSchema = {
  // export validation schema -- DO NOT REMOVE OR EDIT THIS COMMENT
  [AmountTokens.config.name]: AmountTokens.stringSchema,
  [EthereumAddress.config.name]: EthereumAddress.stringSchema,
  [EmailAddress.config.name]: EmailAddress.stringSchema,
  [AmountPercentage.config.name]: AmountPercentage.stringSchema,
  Date: "z.string()",
  DateTime: "z.string()",
  URL: "z.string()",
  Amount_Money: "z.number()",
  OLabel: "z.string()",
  Currency: "z.string()",
  PHID: "z.string()",
  OID: "z.string()",
};
