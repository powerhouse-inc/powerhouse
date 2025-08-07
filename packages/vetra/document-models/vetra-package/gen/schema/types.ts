export type Maybe<T> = T | null;
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
  Currency: { input: string; output: string };
  Date: { input: string; output: string };
  DateTime: { input: string; output: string };
  EmailAddress: { input: string; output: string };
  EthereumAddress: { input: string; output: string };
  OID: { input: string; output: string };
  OLabel: { input: string; output: string };
  PHID: { input: string; output: string };
  URL: { input: string; output: string };
};

export type AddPackageKeywordInput = {
  id: Scalars["String"]["input"];
  label: Scalars["String"]["input"];
};

export type Author = {
  name: Maybe<Scalars["String"]["output"]>;
  website: Maybe<Scalars["URL"]["output"]>;
};

export type Keyword = {
  id: Scalars["OID"]["output"];
  label: Scalars["String"]["output"];
};

export type RemovePackageKeywordInput = {
  id: Scalars["String"]["input"];
};

export type SetPackageAuthorInput = {
  name?: InputMaybe<Scalars["OID"]["input"]>;
  website?: InputMaybe<Scalars["URL"]["input"]>;
};

export type SetPackageAuthorNameInput = {
  name: Scalars["String"]["input"];
};

export type SetPackageAuthorWebsiteInput = {
  website: Scalars["URL"]["input"];
};

export type SetPackageCategoryInput = {
  category: Scalars["String"]["input"];
};

export type SetPackageDescriptionInput = {
  description: Scalars["String"]["input"];
};

export type SetPackageGithubUrlInput = {
  url: Scalars["URL"]["input"];
};

export type SetPackageNameInput = {
  name: Scalars["String"]["input"];
};

export type SetPackageNpmUrlInput = {
  url: Scalars["URL"]["input"];
};

export type VetraPackageState = {
  author: Author;
  category: Maybe<Scalars["String"]["output"]>;
  description: Maybe<Scalars["String"]["output"]>;
  githubUrl: Maybe<Scalars["URL"]["output"]>;
  keywords: Array<Keyword>;
  name: Maybe<Scalars["String"]["output"]>;
  npmUrl: Maybe<Scalars["URL"]["output"]>;
};
