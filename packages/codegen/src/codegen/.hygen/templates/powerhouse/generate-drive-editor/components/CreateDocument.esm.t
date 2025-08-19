---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/components/CreateDocument.tsx"
unless_exists: true
---
import {
  addDocument,
  useDocumentModelModules,
  useEditorModules,
  useSelectedDriveId,
  useSelectedFolder,
  type VetraDocumentModelModule,
} from "@powerhousedao/reactor-browser";
import { Button } from "@powerhousedao/design-system";

/**
 * Document creation UI component.
 * Displays available document types as clickable buttons.
 */
export const CreateDocument = () => {
  const selectedDriveId = useSelectedDriveId();
  const selectedFolder = useSelectedFolder();
  const documentModelModules = useDocumentModelModules();
  const editorModules = useEditorModules();

  async function handleAddDocument(module: VetraDocumentModelModule) {
    if (!selectedDriveId) {
      return;
    }
    await addDocument(
      selectedDriveId,
      `New ${module.documentModel.id} document`,
      module.documentModel.id,
      selectedFolder?.id,
      undefined,
      undefined,
      editorModules?.find((e) =>
        e.documentTypes.includes(module.documentModel.id),
      )?.id,
    );
  }

  return (
    <div className="px-6">
      {/* Customize section title here */}
      <h3 className="mb-3 mt-4 text-sm font-bold text-gray-600">
        New document
      </h3>
      {/* Customize layout by changing flex-wrap, gap, or grid layout */}
      <div className="flex w-full flex-wrap gap-4">
        {documentModelModules?.map((documentModelModule) => {
          return (
            <Button
              key={documentModelModule.documentModel.id}
              color="light" // Customize button appearance
              size="small"
              className="cursor-pointer"
              title={documentModelModule.documentModel.name}
              aria-description={documentModelModule.documentModel.description}
              onClick={() => handleAddDocument(documentModelModule)}
            >
              {/* Customize document type display format */}
              <span className="text-sm">
                {documentModelModule.documentModel.name}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};
