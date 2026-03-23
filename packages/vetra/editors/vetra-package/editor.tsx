import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSetPHDocumentEditorConfig } from "@powerhousedao/reactor-browser";
import { useCallback } from "react";
import {
  addPackageKeyword,
  removePackageKeyword,
  setPackageAuthorName,
  setPackageAuthorWebsite,
  setPackageCategory,
  setPackageDescription,
  setPackageGithubUrl,
  setPackageName,
  setPackageNpmUrl,
} from "../../document-models/vetra-package/index.js";
import { useSelectedDriveVetraPackage } from "../hooks/useVetraDocument.js";
import { MetaForm } from "./components/MetaForm.js";
import { editorConfig } from "./config.js";

export type EditorProps = {
  displayToolbar?: boolean;
};

export default function Editor(props: EditorProps) {
  const { displayToolbar = true } = props;
  useSetPHDocumentEditorConfig(editorConfig);
  const [document, dispatch] = useSelectedDriveVetraPackage();

  const onNameChange = useCallback(
    (name: string) => {
      if (!document.state.global.name && !name) return;
      if (name === document.state.global.name) return;

      dispatch(setPackageName({ name }));
    },
    [document.state.global.name],
  );

  const onDescriptionChange = useCallback(
    (description: string) => {
      if (!document.state.global.description && !description) return;
      if (description === document.state.global.description) return;

      dispatch(setPackageDescription({ description }));
    },
    [document.state.global.description],
  );

  const onCategoryChange = useCallback(
    (category: string) => {
      if (!document.state.global.category && !category) return;
      if (category === document.state.global.category) return;

      dispatch(setPackageCategory({ category }));
    },
    [document.state.global.category],
  );

  const onPublisherChange = useCallback(
    (name: string) => {
      if (!document.state.global.author.name && !name) return;
      if (name === document.state.global.author.name) return;

      dispatch(setPackageAuthorName({ name }));
    },
    [document.state.global.author.name],
  );

  const onPublisherUrlChange = useCallback(
    (website: string) => {
      if (!document.state.global.author.website && !website) return;
      if (website === document.state.global.author.website) return;

      dispatch(setPackageAuthorWebsite({ website }));
    },
    [document.state.global.author.website],
  );

  const onGithubRepositoryChange = useCallback(
    (url: string) => {
      if (!document.state.global.githubUrl && !url) return;
      if (url === document.state.global.githubUrl) return;

      dispatch(setPackageGithubUrl({ url }));
    },
    [document.state.global.githubUrl],
  );

  const onNpmPackageChange = useCallback(
    (url: string) => {
      if (!document.state.global.npmUrl && !url) return;
      if (url === document.state.global.npmUrl) return;

      dispatch(setPackageNpmUrl({ url }));
    },
    [document.state.global.npmUrl],
  );

  const onAddKeyword = useCallback((keyword: { id: string; label: string }) => {
    dispatch(addPackageKeyword(keyword));
  }, []);

  const onRemoveKeyword = useCallback((id: string) => {
    dispatch(removePackageKeyword({ id }));
  }, []);

  return (
    <div className="bg-gray-50 p-6">
      {displayToolbar && <DocumentToolbar />}
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
