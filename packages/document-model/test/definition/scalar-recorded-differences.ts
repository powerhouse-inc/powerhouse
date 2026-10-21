export const RECORDED_DIFFERENCES = Object.freeze([
  {
    id: "amount-typescript-optional-value",
    scalars: ["Amount"],
    summary:
      "The exported TypeScript type makes value optional while Zod requires a finite number.",
  },
  {
    id: "string-amount-literal-numeric-only",
    scalars: ["Amount_Crypto", "Amount_Currency"],
    summary:
      "Zod accepts any string value; the installed literal parser accepts only numeric strings.",
  },
  {
    id: "underscore-resolver-keys",
    scalars: [
      "Amount_Money",
      "Amount_Percentage",
      "Amount_Tokens",
      "Amount_Fiat",
      "Amount_Crypto",
      "Amount_Currency",
    ],
    summary:
      "The installed resolver map keys the six underscore scalars by module name, such as AmountMoney.",
  },
  {
    id: "upload-runtime-exports",
    scalars: ["Upload"],
    summary:
      "The installed module exports no runtime Zod schema; codegen consumes its z.any() source string.",
  },
  {
    id: "amount-literal-float-only",
    scalars: [
      "Amount",
      "Amount_Fiat",
      "Amount_Money",
      "Amount_Percentage",
      "Amount_Tokens",
    ],
    summary:
      "Installed literal parsers require FloatValue even though variable validation accepts integers; Amount's literal may carry an undefined unit.",
  },
  {
    id: "object-amount-normalization",
    scalars: ["Amount", "Amount_Fiat", "Amount_Crypto", "Amount_Currency"],
    summary:
      "Installed coercers return Zod's parsed copy and strip unknown keys; document reducers keep the raw object.",
  },
  {
    id: "codegen-regex-nonstring-coercion",
    scalars: ["Address", "AttachmentRef"],
    summary:
      "Codegen's z.custom predicates stringify a nonstring before testing the regex, so a singleton array holding a valid value passes validation while a list literal is rejected.",
  },
  {
    id: "unknown-upload-non-json-acceptance",
    scalars: ["Unknown", "Upload"],
    summary:
      "z.unknown() and z.any() accept non-JSON and absent values; their rejects partitions are not universal validator rejections.",
  },
] as const);

export type RecordedDifferenceId = (typeof RECORDED_DIFFERENCES)[number]["id"];
