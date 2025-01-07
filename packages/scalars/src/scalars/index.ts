// namespace imports -- DO NOT REMOVE OR EDIT THIS COMMENT
import * as AmountTokens from "./AmountTokens";
import * as EthereumAddress from "./EthereumAddress";
import * as AmountPercentage from "./AmountPercentage";
import * as EmailAddress from "./EmailAddress";
import * as DateScalar from "./Date";
import * as DateTime from "./DateTime";
import * as URLScalar from "./URL";
import * as AmountMoney from "./AmountMoney";
import * as OLabel from "./OLabel";
import * as Currency from "./Currency";
import * as PHID from "./PHID";
import * as OID from "./OID";

// export types -- DO NOT REMOVE OR EDIT THIS COMMENT
export type { ScalarType as AmountTokensScalarType } from "./AmountTokens";
export type { ScalarType as EthereumAddressScalarType } from "./EthereumAddress";
export type { ScalarType as AmountPercentageScalarType } from "./AmountPercentage";
export type { ScalarType as EmailAddressScalarType } from "./EmailAddress";
export type { ScalarType as DateScalarType } from "./Date";
export type { ScalarType as DateTimeScalarType } from "./DateTime";
export type { ScalarType as URLScalarType } from "./URL";
export type { ScalarType as AmountMoneyScalarType } from "./AmountMoney";
export type { ScalarType as OLabelScalarType } from "./OLabel";
export type { ScalarType as CurrencyScalarType } from "./Currency";
export type { ScalarType as PHIDScalarType } from "./PHID";
export type { ScalarType as OIDScalarType } from "./OID";

export {
  // export object -- DO NOT REMOVE OR EDIT THIS COMMENT
  AmountTokens,
  EthereumAddress,
  AmountPercentage,
  EmailAddress,
  DateScalar,
  DateTime,
  URLScalar,
  AmountMoney,
  OLabel,
  Currency,
  PHID,
  OID,
};

export const resolvers = {
  // export resolvers -- DO NOT REMOVE OR EDIT THIS COMMENT
  AmountTokens: AmountTokens.scalar,
  EthereumAddress: EthereumAddress.scalar,
  AmountPercentage: AmountPercentage.scalar,
  EmailAddress: EmailAddress.scalar,
  Date: DateScalar.scalar,
  DateTime: DateTime.scalar,
  URL: URLScalar.scalar,
  AmountMoney: AmountMoney.scalar,
  OLabel: OLabel.scalar,
  Currency: Currency.scalar,
  PHID: PHID.scalar,
  OID: OID.scalar,
};

export const typeDefs = [
  // export typedefs -- DO NOT REMOVE OR EDIT THIS COMMENT
  AmountTokens.typedef,
  EthereumAddress.typedef,
  AmountPercentage.typedef,
  EmailAddress.typedef,
  DateScalar.typedef,
  DateTime.typedef,
  URLScalar.typedef,
  AmountMoney.typedef,
  OLabel.typedef,
  Currency.typedef,
  PHID.typedef,
  OID.typedef,
];

export const generatorTypeDefs = {
  // export generator typedefs -- DO NOT REMOVE OR EDIT THIS COMMENT
  [AmountTokens.config.name]: AmountTokens.type,
  [EthereumAddress.config.name]: EthereumAddress.type,
  [EmailAddress.config.name]: EmailAddress.type,
  [AmountPercentage.config.name]: AmountPercentage.type,
  [DateScalar.config.name]: DateScalar.type,
  [DateTime.config.name]: DateTime.type,
  [URLScalar.config.name]: URLScalar.type,
  [AmountMoney.config.name]: AmountMoney.type,
  [OLabel.config.name]: OLabel.type,
  [Currency.config.name]: Currency.type,
  [PHID.config.name]: PHID.type,
  [OID.config.name]: OID.type,
};

export const validationSchema = {
  // export validation schema -- DO NOT REMOVE OR EDIT THIS COMMENT
  [AmountTokens.config.name]: AmountTokens.stringSchema,
  [EthereumAddress.config.name]: EthereumAddress.stringSchema,
  [EmailAddress.config.name]: EmailAddress.stringSchema,
  [AmountPercentage.config.name]: AmountPercentage.stringSchema,
  [DateScalar.config.name]: DateScalar.stringSchema,
  [DateTime.config.name]: DateTime.stringSchema,
  [URLScalar.config.name]: URLScalar.stringSchema,
  [AmountMoney.config.name]: AmountMoney.stringSchema,
  [OLabel.config.name]: OLabel.stringSchema,
  [Currency.config.name]: Currency.stringSchema,
  [PHID.config.name]: PHID.stringSchema,
  [OID.config.name]: OID.stringSchema,
};
