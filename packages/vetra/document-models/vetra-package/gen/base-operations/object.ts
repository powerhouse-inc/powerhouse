import { BaseDocumentClass } from "document-model";
import type {
  SetPackageNameInput,
  SetPackageDescriptionInput,
  SetPackageCategoryInput,
  SetPackageAuthorInput,
  SetPackageAuthorNameInput,
  SetPackageAuthorWebsiteInput,
  AddPackageKeywordInput,
  RemovePackageKeywordInput,
  SetPackageGithubUrlInput,
  SetPackageNpmUrlInput,
  VetraPackageState,
  VetraPackageLocalState,
} from "../types.js";
import {
  setPackageName,
  setPackageDescription,
  setPackageCategory,
  setPackageAuthor,
  setPackageAuthorName,
  setPackageAuthorWebsite,
  addPackageKeyword,
  removePackageKeyword,
  setPackageGithubUrl,
  setPackageNpmUrl,
} from "./creators.js";
import type { VetraPackageAction } from "../actions.js";

export default class VetraPackage_BaseOperations extends BaseDocumentClass<VetraPackagePHState> {
  public setPackageName(input: SetPackageNameInput) {
    return this.dispatch(setPackageName(input));
  }

  public setPackageDescription(input: SetPackageDescriptionInput) {
    return this.dispatch(setPackageDescription(input));
  }

  public setPackageCategory(input: SetPackageCategoryInput) {
    return this.dispatch(setPackageCategory(input));
  }

  public setPackageAuthor(input: SetPackageAuthorInput) {
    return this.dispatch(setPackageAuthor(input));
  }

  public setPackageAuthorName(input: SetPackageAuthorNameInput) {
    return this.dispatch(setPackageAuthorName(input));
  }

  public setPackageAuthorWebsite(input: SetPackageAuthorWebsiteInput) {
    return this.dispatch(setPackageAuthorWebsite(input));
  }

  public addPackageKeyword(input: AddPackageKeywordInput) {
    return this.dispatch(addPackageKeyword(input));
  }

  public removePackageKeyword(input: RemovePackageKeywordInput) {
    return this.dispatch(removePackageKeyword(input));
  }

  public setPackageGithubUrl(input: SetPackageGithubUrlInput) {
    return this.dispatch(setPackageGithubUrl(input));
  }

  public setPackageNpmUrl(input: SetPackageNpmUrlInput) {
    return this.dispatch(setPackageNpmUrl(input));
  }
}
