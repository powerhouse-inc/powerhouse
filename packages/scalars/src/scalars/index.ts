// namespace imports -- DO NOT REMOVE OR EDIT THIS COMMENT
import * as Amount from "./Amount.js";
import * as AmountCrypto from "./AmountCrypto.js";
import * as AmountCurrency from "./AmountCurrency.js";
import * as AmountFiat from "./AmountFiat.js";
import * as AmountMoney from "./AmountMoney.js";
import * as AmountPercentage from "./AmountPercentage.js";
import * as AmountTokens from "./AmountTokens.js";
import * as Currency from "./Currency.js";
import * as DateScalar from "./Date.js";
import * as DateTime from "./DateTime.js";
import * as EmailAddress from "./EmailAddress.js";
import * as EthereumAddress from "./EthereumAddress.js";
import * as OID from "./OID.js";
import * as OLabel from "./OLabel.js";
import * as PHID from "./PHID.js";
import * as URLScalar from "./URL.js";

// export types -- DO NOT REMOVE OR EDIT THIS COMMENT
export type { ScalarType as AmountScalarType } from "./Amount.js";
export type { ScalarType as AmountCryptoScalarType } from "./AmountCrypto.js";
export type { ScalarType as AmountCurrencyScalarType } from "./AmountCurrency.js";
export type { ScalarType as AmountFiatScalarType } from "./AmountFiat.js";
export type { ScalarType as AmountMoneyScalarType } from "./AmountMoney.js";
export type { ScalarType as AmountPercentageScalarType } from "./AmountPercentage.js";
export type { ScalarType as AmountTokensScalarType } from "./AmountTokens.js";
export type { ScalarType as CurrencyScalarType } from "./Currency.js";
export type { ScalarType as DateScalarType } from "./Date.js";
export type { ScalarType as DateTimeScalarType } from "./DateTime.js";
export type { ScalarType as EmailAddressScalarType } from "./EmailAddress.js";
export type { ScalarType as EthereumAddressScalarType } from "./EthereumAddress.js";
export type { ScalarType as OIDScalarType } from "./OID.js";
export type { ScalarType as OLabelScalarType } from "./OLabel.js";
export type { ScalarType as PHIDScalarType } from "./PHID.js";
export type { ScalarType as URLScalarType } from "./URL.js";

export {
  Amount,
  AmountCrypto,
  AmountCurrency,
  AmountFiat,
  AmountMoney,
  AmountPercentage,
  // export object -- DO NOT REMOVE OR EDIT THIS COMMENT
  AmountTokens,
  Currency,
  DateScalar,
  DateTime,
  EmailAddress,
  EthereumAddress,
  OID,
  OLabel,
  PHID,
  URLScalar
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
  AmountFiat: AmountFiat.scalar,
  AmountCurrency: AmountCurrency.scalar,
  AmountCrypto: AmountCrypto.scalar,
  Amount: Amount.scalar,
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
  AmountFiat.typedef,
  AmountCurrency.typedef,
  AmountCrypto.typedef,
  Amount.typedef,
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
  [AmountFiat.config.name]: AmountFiat.type,
  [AmountCurrency.config.name]: AmountCurrency.type,
  [AmountCrypto.config.name]: AmountCrypto.type,
  [Amount.config.name]: Amount.type,
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
  [AmountFiat.config.name]: AmountFiat.stringSchema,
  [AmountCurrency.config.name]: AmountCurrency.stringSchema,
  [AmountCrypto.config.name]: AmountCrypto.stringSchema,
  [Amount.config.name]: Amount.stringSchema,
};
