---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/hooks/useOnDropFile.ts"
unless_exists: true
---
import {
  addFile,
  useSelectedDrive,
  useSelectedFolder,
} from "@powerhousedao/reactor-browser";
import { useCallback } from "react";

export const useOnDropFile = () => {
  const [selectedDrive] = useSelectedDrive();
  const selectedDriveId = selectedDrive?.header.id;
  const selectedFolder = useSelectedFolder();

  const onDropFile = useCallback(
    async (file: File) => {
      if (!selectedDriveId) return;

      const fileName = file.name.replace(/\..+/gim, "");

      return await addFile(file, selectedDriveId, fileName, selectedFolder?.id);
    },
    [addFile, selectedDriveId, selectedFolder],
  );

  return onDropFile;
};