import { BaseDocumentClass } from "document-model";
import {
  type SetPackageNameInput,
  type SetPackageDescriptionInput,
  type SetPackageCategoryInput,
  type SetPackagePublisherInput,
  type SetPackagePublisherUrlInput,
  type SetPackageKeywordsInput,
  type SetPackageGithubUrlInput,
  type SetPackageNpmUrlInput,
  type VetraPackageState,
  type VetraPackageLocalState,
} from "../types.js";
import {
  setPackageName,
  setPackageDescription,
  setPackageCategory,
  setPackagePublisher,
  setPackagePublisherUrl,
  setPackageKeywords,
  setPackageGithubUrl,
  setPackageNpmUrl,
} from "./creators.js";
import { type VetraPackageAction } from "../actions.js";

export default class VetraPackage_PackageOperations extends BaseDocumentClass<
  VetraPackageState,
  VetraPackageLocalState,
  VetraPackageAction
> {
  public setPackageName(input: SetPackageNameInput) {
    return this.dispatch(setPackageName(input));
  }

  public setPackageDescription(input: SetPackageDescriptionInput) {
    return this.dispatch(setPackageDescription(input));
  }

  public setPackageCategory(input: SetPackageCategoryInput) {
    return this.dispatch(setPackageCategory(input));
  }

  public setPackagePublisher(input: SetPackagePublisherInput) {
    return this.dispatch(setPackagePublisher(input));
  }

  public setPackagePublisherUrl(input: SetPackagePublisherUrlInput) {
    return this.dispatch(setPackagePublisherUrl(input));
  }

  public setPackageKeywords(input: SetPackageKeywordsInput) {
    return this.dispatch(setPackageKeywords(input));
  }

  public setPackageGithubUrl(input: SetPackageGithubUrlInput) {
    return this.dispatch(setPackageGithubUrl(input));
  }

  public setPackageNpmUrl(input: SetPackageNpmUrlInput) {
    return this.dispatch(setPackageNpmUrl(input));
  }
}
