import { addressScalar } from "./address.js";
import { amountCryptoScalar } from "./amount-crypto.js";
import { amountCurrencyScalar } from "./amount-currency.js";
import { amountFiatScalar } from "./amount-fiat.js";
import { amountMoneyScalar } from "./amount-money.js";
import { amountPercentageScalar } from "./amount-percentage.js";
import { amountTokensScalar } from "./amount-tokens.js";
import { amountScalar } from "./amount.js";
import { attachmentRefScalar } from "./attachment-ref.js";
import { currencyScalar } from "./currency.js";
import { dateTimeScalar } from "./date-time.js";
import { dateScalar } from "./date.js";
import { emailAddressScalar } from "./email-address.js";
import { ethereumAddressScalar } from "./ethereum-address.js";
import { jsonObjectScalar } from "./json-object.js";
import { oidScalar } from "./oid.js";
import { oLabelScalar } from "./olabel.js";
import { phidScalar } from "./phid.js";
import { unknownScalar } from "./unknown.js";
import { uploadScalar } from "./upload.js";
import { urlScalar } from "./url.js";

export type { Address } from "./address.js";
export type { AmountWithNumberValue } from "./amount-fiat.js";
export type { Amount } from "./amount.js";
export type { AmountWithStringValue } from "./amounts.js";
export type { AttachmentRef } from "./attachment-ref.js";

/**
 * Every scalar the compiler-owned catalog declares, one file each, written
 * with the same `defineScalar` a package scalar would use. The order is part
 * of the catalog digest, so a new scalar goes at the end.
 */
export const builtInScalars = [
  phidScalar,
  oidScalar,
  oLabelScalar,
  currencyScalar,
  emailAddressScalar,
  ethereumAddressScalar,
  urlScalar,
  dateScalar,
  dateTimeScalar,
  amountMoneyScalar,
  amountPercentageScalar,
  amountTokensScalar,
  amountScalar,
  amountFiatScalar,
  amountCryptoScalar,
  amountCurrencyScalar,
  uploadScalar,
  addressScalar,
  attachmentRefScalar,
  unknownScalar,
  jsonObjectScalar,
] as const;

export const scalarDeclarations = builtInScalars.map(
  (scalar) => scalar.declaration,
);
