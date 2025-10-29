import { DriveEditorContainer } from "@powerhousedao/connect";
import {
  defaultPHDocumentEditorConfig,
  defaultPHDriveEditorConfig,
} from "@powerhousedao/connect/config";
import {
  setPHDocumentEditorConfig,
  setPHDriveEditorConfig,
  useSelectedDocument,
  useSelectedDriveSafe,
  useSelectedFolder,
} from "@powerhousedao/reactor-browser";
import { useEffect } from "react";
import { useNavigate } from "react-router";

export function DrivePage() {
  const [selectedDrive] = useSelectedDriveSafe();
  const selectedFolder = useSelectedFolder();
  const [selectedDocument] = useSelectedDocument();
  const navigate = useNavigate();

  useEffect(() => {
    if (!selectedDocument) {
      setPHDocumentEditorConfig(defaultPHDocumentEditorConfig);
    }
  }, [selectedDocument]);

  useEffect(() => {
    if (!selectedDrive) {
      setPHDriveEditorConfig(defaultPHDriveEditorConfig);
    }
  }, [selectedDrive]);

  return selectedDrive ? <DriveEditorContainer /> : null;
}
