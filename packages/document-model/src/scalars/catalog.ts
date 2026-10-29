import { unknownScalar } from "./declarations/unknown.js";
import { dateTimeScalar } from "./declarations/date-time.js";
import { addressScalar } from "./declarations/address.js";
import { attachmentRefScalar } from "./declarations/attachment-ref.js";
import { amountTokensScalar } from "./declarations/amount-tokens.js";
import { ethereumAddressScalar } from "./declarations/ethereum-address.js";
import { emailAddressScalar } from "./declarations/email-address.js";
import { amountPercentageScalar } from "./declarations/amount-percentage.js";
import { dateScalar } from "./declarations/date.js";
import { urlScalar } from "./declarations/url.js";
import { amountMoneyScalar } from "./declarations/amount-money.js";
import { olabelScalar } from "./declarations/olabel.js";
import { currencyScalar } from "./declarations/currency.js";
import { phidScalar } from "./declarations/phid.js";
import { oidScalar } from "./declarations/oid.js";
import { amountFiatScalar } from "./declarations/amount-fiat.js";
import { amountCurrencyScalar } from "./declarations/amount-currency.js";
import { amountCryptoScalar } from "./declarations/amount-crypto.js";
import { amountScalar } from "./declarations/amount.js";
import { uploadScalar } from "./declarations/upload.js";
import { jsonObjectScalar } from "./declarations/json-object.js";
import type { DescribedScalarDefinition } from "./types.js";

export const scalarCatalog: readonly DescribedScalarDefinition[] =
  Object.freeze([
    unknownScalar,
    dateTimeScalar,
    addressScalar,
    attachmentRefScalar,
    amountTokensScalar,
    ethereumAddressScalar,
    emailAddressScalar,
    amountPercentageScalar,
    dateScalar,
    urlScalar,
    amountMoneyScalar,
    olabelScalar,
    currencyScalar,
    phidScalar,
    oidScalar,
    amountFiatScalar,
    amountCurrencyScalar,
    amountCryptoScalar,
    amountScalar,
    uploadScalar,
    jsonObjectScalar,
  ]);

const byName = new Map(
  scalarCatalog.map((definition) => [definition.name, definition]),
);

export function getCatalogScalar(
  name: string,
): DescribedScalarDefinition | undefined {
  return byName.get(name);
}

type DocumentModelScalar = DescribedScalarDefinition & {
  readonly typescriptType: string;
  readonly zodSource: string;
};

// A model's SDL may use every catalog scalar codegen can type. JSONObject is
// host-only, so it has neither a TypeScript type nor a zod source.
export const documentModelScalars: readonly DocumentModelScalar[] =
  Object.freeze(
    scalarCatalog.filter(
      (definition): definition is DocumentModelScalar =>
        definition.typescriptType !== null && definition.zodSource !== null,
    ),
  );
