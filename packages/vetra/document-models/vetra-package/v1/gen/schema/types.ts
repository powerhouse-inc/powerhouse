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
  AttachmentRef: {
    input: `attachment://v${number}:${string}`;
    output: `attachment://v${number}:${string}`;
  };
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

export type AddPackageKeywordInput = {
  id: Scalars["String"]["input"];
  label: Scalars["String"]["input"];
};

/** Author/maintainer of the Vetra Package. */
export type Author = {
  /** Display name of the author or organization. */
  name: Maybe<Scalars["String"]["output"]>;
  /** Author's website URL. */
  website: Maybe<Scalars["URL"]["output"]>;
};

/** A single search keyword attached to the package. */
export type Keyword = {
  /** Stable identifier for the keyword entry; used to remove it. */
  id: Scalars["OID"]["output"];
  /** Display label for the keyword (e.g. 'invoicing', 'defi'). */
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

/**
 * Package metadata used to publish a Vetra Reactor Package to npm and surface
 * it inside Connect/Switchboard. All fields are optional so a package can be
 * created empty and filled in incrementally during development.
 */
export type VetraPackageState = {
  /** Author/maintainer information surfaced in the published package metadata. */
  author: Author;
  /** Free-form category label used to group packages in directories (e.g. 'Finance', 'Productivity'). */
  category: Maybe<Scalars["String"]["output"]>;
  /** One-paragraph summary of what the package provides. Shown on package listing pages. */
  description: Maybe<Scalars["String"]["output"]>;
  /** Public source code URL (typically a GitHub repository). */
  githubUrl: Maybe<Scalars["URL"]["output"]>;
  /** Search keywords associated with the package. Each keyword has a stable id so it can be removed individually. */
  keywords: Array<Keyword>;
  /** Human-readable package name (e.g. 'Pizza Plaza'). Distinct from the npm package id. */
  name: Maybe<Scalars["String"]["output"]>;
  /** Published npm package URL. Set once the package has been released. */
  npmUrl: Maybe<Scalars["URL"]["output"]>;
};
