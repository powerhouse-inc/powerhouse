import type { EditorProps } from "document-model";
import {
  type VetraPackageDocument,
  actions,
} from "../../document-models/vetra-package/index.js";
import { MetaForm } from "./components/MetaForm.js";
import { useCallback } from "react";

export type IProps = EditorProps<VetraPackageDocument>;

export default function Editor(props: IProps) {
  const { document, dispatch } = props;

  console.log(">>>>> document:",document.state.global);

  const onNameChange = useCallback((name: string) => {
    if (!document.state.global.name && !name) return;
    if (name === document.state.global.name) return;

    dispatch(actions.setPackageName({ name }));
    
  }, [document.state.global.name]);

  const onDescriptionChange = useCallback((description: string) => {
    if (!document.state.global.description && !description) return;
    if (description === document.state.global.description) return;

    dispatch(actions.setPackageDescription({ description }));
    
  }, [document.state.global.description]);

  const onCategoryChange = useCallback((category: string) => {
    if (!document.state.global.category && !category) return;
    if (category === document.state.global.category) return;

    dispatch(actions.setPackageCategory({ category }));
    
  }, [document.state.global.category]);

  const onPublisherChange = useCallback((name: string) => {
    if (!document.state.global.author.name && !name) return;
    if (name === document.state.global.author.name) return;

    dispatch(actions.setPackageAuthorName({ name }));
    
  }, [document.state.global.author.name]);

  const onPublisherUrlChange = useCallback((website: string) => {
    if (!document.state.global.author.website && !website) return;
    if (website === document.state.global.author.website) return;

    dispatch(actions.setPackageAuthorWebsite({ website }));
    
  }, [document.state.global.author.website]);

  const onGithubRepositoryChange = useCallback((url: string) => {
    if (!document.state.global.githubUrl && !url) return;
    if (url === document.state.global.githubUrl) return;

    dispatch(actions.setPackageGithubUrl({ url }));
    
  }, [document.state.global.githubUrl]);

  const onNpmPackageChange = useCallback((url: string) => {
    if (!document.state.global.npmUrl && !url) return;
    if (url === document.state.global.npmUrl) return;

    dispatch(actions.setPackageNpmUrl({ url }));
    
  }, [document.state.global.npmUrl]);

  const onAddKeyword = useCallback((keyword: { id: string; label: string }) => {
    dispatch(actions.addPackageKeyword(keyword));
  }, []);

  const onRemoveKeyword = useCallback((id: string) => {
    dispatch(actions.removePackageKeyword({ id }));
  }, []);

  return (
    <div>
      <MetaForm
        name={document.state.global.name ?? ""}
        description={document.state.global.description ?? ""}
        category={document.state.global.category ?? ""}
        publisher={document.state.global.author.name ?? ""}
        publisherUrl={document.state.global.author.website ?? ""}
        githubRepository={document.state.global.githubUrl ?? ""}
        npmPackage={document.state.global.npmUrl ?? ""}
        keywords={document.state.global.keywords}
        onNameChange={onNameChange}
        onDescriptionChange={onDescriptionChange}
        onCategoryChange={onCategoryChange}
        onPublisherChange={onPublisherChange}
        onPublisherUrlChange={onPublisherUrlChange}
        onGithubRepositoryChange={onGithubRepositoryChange}
        onNpmPackageChange={onNpmPackageChange}
        onAddKeyword={onAddKeyword}
        onRemoveKeyword={onRemoveKeyword}
      />
    </div>
  );
}
