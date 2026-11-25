export type Maybe<T> = T | null | undefined;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  Address: { input: `${string}:0x${string}`; output: `${string}:0x${string}` };
  Amount: {
    input: { unit?: string; value?: number };
    output: { unit?: string; value?: number };
  };
  Amount_Crypto: {
    input: { unit: string; value: string };
    output: { unit: string; value: string };
  };
  Amount_Currency: {
    input: { unit: string; value: string };
    output: { unit: string; value: string };
  };
  Amount_Fiat: {
    input: { unit: string; value: number };
    output: { unit: string; value: number };
  };
  Amount_Money: { input: number; output: number };
  Amount_Percentage: { input: number; output: number };
  Amount_Tokens: { input: number; output: number };
  Attachment: { input: string; output: string };
  Currency: { input: string; output: string };
  Date: { input: string; output: string };
  DateTime: { input: string; output: string };
  EmailAddress: { input: string; output: string };
  EthereumAddress: { input: string; output: string };
  OID: { input: string; output: string };
  OLabel: { input: string; output: string };
  PHID: { input: string; output: string };
  URL: { input: string; output: string };
  Unknown: { input: unknown; output: unknown };
  Upload: { input: File; output: File };
};

export type AddColorInput = {
  hex: Scalars["String"]["input"];
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  name: Scalars["String"]["input"];
  role: ColorRole;
  usage: Scalars["String"]["input"];
};

export type AddImageryReferenceInput = {
  data?: InputMaybe<Scalars["String"]["input"]>;
  filename?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  mediaType?: InputMaybe<Scalars["String"]["input"]>;
  url?: InputMaybe<Scalars["URL"]["input"]>;
};

export type AddLogoInput = {
  description: Scalars["String"]["input"];
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  markType: MarkType;
};

export type AddSuggestionInput = {
  agent: Scalars["String"]["input"];
  content: Scalars["String"]["input"];
  createdAt: Scalars["DateTime"]["input"];
  id: Scalars["OID"]["input"];
};

export type AddTypefaceInput = {
  alternatives: Array<Scalars["String"]["input"]>;
  family: Scalars["String"]["input"];
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  notes?: InputMaybe<Scalars["String"]["input"]>;
  role: TypeRole;
};

export type AgentFeedback = {
  readyForFeedback: Scalars["Boolean"]["output"];
  suggestions: Array<Suggestion>;
};

export type BrandSheetState = {
  agentFeedback: AgentFeedback;
  colors: Array<Color>;
  concept: Maybe<Scalars["String"]["output"]>;
  imagery: Maybe<Imagery>;
  logos: Array<Logo>;
  maxim: Maybe<Scalars["String"]["output"]>;
  name: Maybe<Scalars["String"]["output"]>;
  typography: Array<Typeface>;
  voice: Maybe<Voice>;
};

export type ClearConceptInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearImageryDirectionInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearLogoAssetInput = {
  logoId: Scalars["OID"]["input"];
};

export type ClearMaximInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearProductNameInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearVoiceInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type Color = {
  hex: Scalars["String"]["output"];
  id: Scalars["OID"]["output"];
  name: Scalars["String"]["output"];
  role: ColorRole;
  usage: Scalars["String"]["output"];
};

export type ColorRole = "ACCENT" | "PRIMARY" | "SECONDARY" | "SURFACE" | "TEXT";

export type ImageRef = {
  data: Maybe<Scalars["String"]["output"]>;
  filename: Maybe<Scalars["String"]["output"]>;
  id: Scalars["OID"]["output"];
  mediaType: Maybe<Scalars["String"]["output"]>;
  url: Maybe<Scalars["URL"]["output"]>;
};

export type Imagery = {
  avoid: Array<Scalars["String"]["output"]>;
  direction: Maybe<Scalars["String"]["output"]>;
  include: Array<Scalars["String"]["output"]>;
  references: Array<ImageRef>;
};

export type Logo = {
  assetData: Maybe<Scalars["String"]["output"]>;
  assetFilename: Maybe<Scalars["String"]["output"]>;
  assetMediaType: Maybe<Scalars["String"]["output"]>;
  assetUrl: Maybe<Scalars["URL"]["output"]>;
  description: Scalars["String"]["output"];
  id: Scalars["OID"]["output"];
  markType: MarkType;
};

export type MarkType = "COMBINATION" | "SYMBOL" | "WORDMARK";

export type RemoveColorInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveImageryReferenceInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveLogoInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveSuggestionInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveTypefaceInput = {
  id: Scalars["OID"]["input"];
};

export type ReorderColorsInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
};

export type ReorderImageryReferencesInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
};

export type ReorderLogosInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
};

export type ReorderTypefacesInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
};

export type ResolveSuggestionInput = {
  changeApplied: Scalars["Boolean"]["input"];
  comment?: InputMaybe<Scalars["String"]["input"]>;
  decision: SuggestionDecision;
  id: Scalars["OID"]["input"];
  resolvedAt: Scalars["DateTime"]["input"];
};

export type SetConceptInput = {
  concept: Scalars["String"]["input"];
};

export type SetImageryDirectionInput = {
  direction: Scalars["String"]["input"];
};

export type SetImageryGuidanceInput = {
  avoid: Array<Scalars["String"]["input"]>;
  include: Array<Scalars["String"]["input"]>;
};

export type SetLogoAssetInput = {
  data?: InputMaybe<Scalars["String"]["input"]>;
  filename?: InputMaybe<Scalars["String"]["input"]>;
  logoId: Scalars["OID"]["input"];
  mediaType?: InputMaybe<Scalars["String"]["input"]>;
  url?: InputMaybe<Scalars["URL"]["input"]>;
};

export type SetMaximInput = {
  maxim: Scalars["String"]["input"];
};

export type SetProductNameInput = {
  name: Scalars["String"]["input"];
};

export type SetReadyForFeedbackInput = {
  ready: Scalars["Boolean"]["input"];
};

export type SetVoiceInput = {
  guidance: Scalars["String"]["input"];
  qualities: Array<Scalars["String"]["input"]>;
};

export type SetVoiceVocabularyInput = {
  avoid: Array<Scalars["String"]["input"]>;
  prefer: Array<Scalars["String"]["input"]>;
};

export type Suggestion = {
  agent: Scalars["String"]["output"];
  content: Scalars["String"]["output"];
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["OID"]["output"];
  resolution: Maybe<SuggestionResolution>;
};

export type SuggestionDecision = "ACCEPTED" | "DISMISSED";

export type SuggestionResolution = {
  changeApplied: Scalars["Boolean"]["output"];
  comment: Maybe<Scalars["String"]["output"]>;
  decision: SuggestionDecision;
  resolvedAt: Scalars["DateTime"]["output"];
};

export type TypeRole = "BODY" | "HEADLINE" | "NUMERALS" | "UI";

export type Typeface = {
  alternatives: Array<Scalars["String"]["output"]>;
  family: Scalars["String"]["output"];
  id: Scalars["OID"]["output"];
  notes: Maybe<Scalars["String"]["output"]>;
  role: TypeRole;
};

export type UpdateColorInput = {
  hex?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
  role?: InputMaybe<ColorRole>;
  usage?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateLogoInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  markType?: InputMaybe<MarkType>;
};

export type UpdateTypefaceInput = {
  alternatives?: InputMaybe<Array<Scalars["String"]["input"]>>;
  family?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  notes?: InputMaybe<Scalars["String"]["input"]>;
  role?: InputMaybe<TypeRole>;
};

export type UpdateVoiceInput = {
  guidance?: InputMaybe<Scalars["String"]["input"]>;
  qualities?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export type Vocabulary = {
  avoid: Array<Scalars["String"]["output"]>;
  prefer: Array<Scalars["String"]["output"]>;
};

export type Voice = {
  guidance: Scalars["String"]["output"];
  qualities: Array<Scalars["String"]["output"]>;
  vocabulary: Vocabulary;
};
