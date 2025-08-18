import { useDispatch } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { useCallback } from "react";
import {
    type VetraPackageDocument,
    actions
} from "../../document-models/vetra-package/index.js";
import { MetaForm } from "./components/MetaForm.js";

export type IProps = EditorProps;

export default function Editor(props: IProps) {
  const { document: initialDocument } = props;
  const [document, dispatch] = useDispatch(initialDocument);
  const unsafeCastOfDocument = document as VetraPackageDocument;
  console.log(">>>>> document:",unsafeCastOfDocument.state.global);

  const onNameChange = useCallback((name: string) => {
    if (!unsafeCastOfDocument.state.global.name && !name) return;
    if (name === unsafeCastOfDocument.state.global.name) return;

    dispatch(actions.setPackageName({ name }));
    
  }, [unsafeCastOfDocument.state.global.name]);

  const onDescriptionChange = useCallback((description: string) => {
    if (!unsafeCastOfDocument.state.global.description && !description) return;
    if (description === unsafeCastOfDocument.state.global.description) return;

    dispatch(actions.setPackageDescription({ description }));
    
  }, [unsafeCastOfDocument.state.global.description]);

  const onCategoryChange = useCallback((category: string) => {
    if (!unsafeCastOfDocument.state.global.category && !category) return;
    if (category === unsafeCastOfDocument.state.global.category) return;

    dispatch(actions.setPackageCategory({ category }));
    
  }, [unsafeCastOfDocument.state.global.category]);

  const onPublisherChange = useCallback((name: string) => {
    if (!unsafeCastOfDocument.state.global.author.name && !name) return;
    if (name === unsafeCastOfDocument.state.global.author.name) return;

    dispatch(actions.setPackageAuthorName({ name }));
    
  }, [unsafeCastOfDocument.state.global.author.name]);

  const onPublisherUrlChange = useCallback((website: string) => {
    if (!unsafeCastOfDocument.state.global.author.website && !website) return;
    if (website === unsafeCastOfDocument.state.global.author.website) return;

    dispatch(actions.setPackageAuthorWebsite({ website }));
    
  }, [unsafeCastOfDocument.state.global.author.website]);

  const onGithubRepositoryChange = useCallback((url: string) => {
    if (!unsafeCastOfDocument.state.global.githubUrl && !url) return;
    if (url === unsafeCastOfDocument.state.global.githubUrl) return;

    dispatch(actions.setPackageGithubUrl({ url }));
    
  }, [unsafeCastOfDocument.state.global.githubUrl]);

  const onNpmPackageChange = useCallback((url: string) => {
    if (!unsafeCastOfDocument.state.global.npmUrl && !url) return;
    if (url === unsafeCastOfDocument.state.global.npmUrl) return;

    dispatch(actions.setPackageNpmUrl({ url }));
    
  }, [unsafeCastOfDocument.state.global.npmUrl]);

  const onAddKeyword = useCallback((keyword: { id: string; label: string }) => {
    dispatch(actions.addPackageKeyword(keyword));
  }, []);

  const onRemoveKeyword = useCallback((id: string) => {
    dispatch(actions.removePackageKeyword({ id }));
  }, []);

  return (
    <div>
      <MetaForm
        name={unsafeCastOfDocument.state.global.name ?? ""}
        description={unsafeCastOfDocument.state.global.description ?? ""}
        category={unsafeCastOfDocument.state.global.category ?? ""}
        publisher={unsafeCastOfDocument.state.global.author.name ?? ""}
        publisherUrl={unsafeCastOfDocument.state.global.author.website ?? ""}
        githubRepository={unsafeCastOfDocument.state.global.githubUrl ?? ""}
        npmPackage={unsafeCastOfDocument.state.global.npmUrl ?? ""}
        keywords={unsafeCastOfDocument.state.global.keywords}
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
