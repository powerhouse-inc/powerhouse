// namespace imports -- DO NOT REMOVE OR EDIT THIS COMMENT
import { AmountScalar } from "./Amount.js";
import { AmountCryptoScalar } from "./AmountCrypto.js";
import { AmountCurrencyScalar } from "./AmountCurrency.js";
import { AmountFiatScalar } from "./AmountFiat.js";
import { AmountMoneyScalar } from "./AmountMoney.js";
import { AmountPercentageScalar } from "./AmountPercentage.js";
import { AmountTokensScalar } from "./AmountTokens.js";
import { CurrencyScalar } from "./Currency.js";
import { DateScalar } from "./Date.js";
import { DateTimeScalar } from "./DateTime.js";
import { EmailAddressScalar } from "./EmailAddress.js";
import { EthereumAddressScalar } from "./EthereumAddress.js";
import { OIDScalar } from "./OID.js";
import { OLabelScalar } from "./OLabel.js";
import { PHIDScalar } from "./PHID.js";
import { URLScalar } from "./URL.js";

export {
  AmountCryptoScalar,
  AmountCurrencyScalar,
  AmountFiatScalar,
  AmountMoneyScalar,
  AmountPercentageScalar,
  AmountScalar,
  AmountTokensScalar,
  CurrencyScalar,
  DateScalar,
  DateTimeScalar,
  EmailAddressScalar,
  EthereumAddressScalar,
  OIDScalar,
  OLabelScalar,
  PHIDScalar,
  URLScalar,
};

export const scalars = [
  AmountCryptoScalar,
  AmountCurrencyScalar,
  AmountFiatScalar,
  AmountMoneyScalar,
  AmountPercentageScalar,
  AmountScalar,
  AmountTokensScalar,
  CurrencyScalar,
  DateScalar,
  DateTimeScalar,
  EmailAddressScalar,
  EthereumAddressScalar,
  OIDScalar,
  OLabelScalar,
  PHIDScalar,
  URLScalar,
] as const;

export type PHScalars = typeof scalars;
export type PHIDScalar = PHScalars[number];

export const resolvers = {
  // export resolvers -- DO NOT REMOVE OR EDIT THIS COMMENT
  AmountTokens: AmountTokensScalar.scalar,
  EthereumAddress: EthereumAddressScalar.scalar,
  AmountPercentage: AmountPercentageScalar.scalar,
  EmailAddress: EmailAddressScalar.scalar,
  DateTime: DateTimeScalar.scalar,
  AmountMoney: AmountMoneyScalar.scalar,
  OLabel: OLabelScalar.scalar,
  Currency: CurrencyScalar.scalar,
  PHID: PHIDScalar.scalar,
  OID: OIDScalar.scalar,
  AmountFiat: AmountFiatScalar.scalar,
  AmountCurrency: AmountCurrencyScalar.scalar,
  AmountCrypto: AmountCryptoScalar.scalar,
  Amount: AmountScalar.scalar,
  Date: DateScalar.scalar,
  URL: URLScalar.scalar,
} as const;

export const typeDefs = scalars.map((scalar) => scalar.typedef);

export const generatorTypeDefs = {
  // export generator typedefs -- DO NOT REMOVE OR EDIT THIS COMMENT
  [AmountTokensScalar.config.name]: AmountTokensScalar.type,
  [EthereumAddressScalar.config.name]: EthereumAddressScalar.type,
  [EmailAddressScalar.config.name]: EmailAddressScalar.type,
  [AmountPercentageScalar.config.name]: AmountPercentageScalar.type,
  [DateTimeScalar.config.name]: DateTimeScalar.type,
  [AmountMoneyScalar.config.name]: AmountMoneyScalar.type,
  [OLabelScalar.config.name]: OLabelScalar.type,
  [CurrencyScalar.config.name]: CurrencyScalar.type,
  [PHIDScalar.config.name]: PHIDScalar.type,
  [OIDScalar.config.name]: OIDScalar.type,
  [AmountFiatScalar.config.name]: AmountFiatScalar.type,
  [AmountCurrencyScalar.config.name]: AmountCurrencyScalar.type,
  [AmountCryptoScalar.config.name]: AmountCryptoScalar.type,
  [AmountScalar.config.name]: AmountScalar.type,
  [DateScalar.config.name]: DateScalar.type,
  [URLScalar.config.name]: URLScalar.type,
};

export const validationSchema = {
  // export validation schema -- DO NOT REMOVE OR EDIT THIS COMMENT
  [AmountTokensScalar.config.name]: AmountTokensScalar.stringSchema,
  [EthereumAddressScalar.config.name]: EthereumAddressScalar.stringSchema,
  [EmailAddressScalar.config.name]: EmailAddressScalar.stringSchema,
  [AmountPercentageScalar.config.name]: AmountPercentageScalar.stringSchema,
  [DateTimeScalar.config.name]: DateTimeScalar.stringSchema,
  [AmountMoneyScalar.config.name]: AmountMoneyScalar.stringSchema,
  [OLabelScalar.config.name]: OLabelScalar.stringSchema,
  [CurrencyScalar.config.name]: CurrencyScalar.stringSchema,
  [PHIDScalar.config.name]: PHIDScalar.stringSchema,
  [OIDScalar.config.name]: OIDScalar.stringSchema,
  [AmountFiatScalar.config.name]: AmountFiatScalar.stringSchema,
  [AmountCurrencyScalar.config.name]: AmountCurrencyScalar.stringSchema,
  [AmountCryptoScalar.config.name]: AmountCryptoScalar.stringSchema,
  [AmountScalar.config.name]: AmountScalar.stringSchema,
  [DateScalar.config.name]: DateScalar.stringSchema,
  [URLScalar.config.name]: URLScalar.stringSchema,
};
