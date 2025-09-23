import type {
  ConflictResolution,
  FileUploadProgress,
} from "@powerhousedao/reactor-browser";
import type { Node } from "document-drive";
import { useCallback, useEffect, useReducer } from "react";
import {
  type OnAddFileWithProgress,
  type UploadTracker,
  formatFileSize,
  generateId,
  mapProgressStageToStatus,
} from "./utils.js";

// State type
type UploadsState = {
  [uploadId: string]: UploadTracker | undefined;
};

// Action types
type UploadAction =
  | {
      type: "ADD_UPLOAD";
      payload: {
        id: string;
        fileName: string;
        fileSize: string;
      };
    }
  | {
      type: "UPDATE_PROGRESS";
      payload: {
        id: string;
        progress: FileUploadProgress;
      };
    }
  | {
      type: "SET_FILE_NODE";
      payload: {
        id: string;
        fileNode?: Node;
      };
    }
  | {
      type: "SET_ERROR";
      payload: {
        id: string;
        error: string;
      };
    }
  | {
      type: "REMOVE_UPLOAD";
      payload: {
        id: string;
      };
    }
  | {
      type: "CLEAR_ALL_UPLOADS";
    }
  | {
      type: "SET_CONFLICT_DATA";
      payload: {
        id: string;
        file: File;
        parentNode?: Node;
      };
    }
  | {
      type: "CLEAR_CONFLICTED_UPLOADS";
    };

// Reducer function
function uploadsReducer(
  state: UploadsState,
  action: UploadAction,
): UploadsState {
  switch (action.type) {
    case "ADD_UPLOAD":
      return {
        ...state,
        [action.payload.id]: {
          id: action.payload.id,
          fileName: action.payload.fileName,
          fileSize: action.payload.fileSize,
          status: "pending",
          progress: 0,
          fileNode: undefined,
        },
      };

    case "UPDATE_PROGRESS": {
      const currentUpload = state[action.payload.id];
      if (!currentUpload) return state;

      return {
        ...state,
        [action.payload.id]: {
          ...currentUpload,
          status: mapProgressStageToStatus(action.payload.progress.stage),
          progress: action.payload.progress.progress,
          errorDetails: action.payload.progress.error,
          // Update documentType if provided
          ...(action.payload.progress.documentType && {
            documentType: action.payload.progress.documentType,
          }),
          // Update duplicateType if provided (for conflicts)
          ...(action.payload.progress.duplicateType && {
            duplicateType: action.payload.progress.duplicateType,
          }),
        },
      };
    }

    case "SET_FILE_NODE": {
      const uploadToUpdate = state[action.payload.id];
      if (!uploadToUpdate) return state;

      return {
        ...state,
        [action.payload.id]: {
          ...uploadToUpdate,
          fileNode: action.payload.fileNode,
        },
      };
    }

    case "SET_ERROR": {
      const failedUpload = state[action.payload.id];
      if (!failedUpload) return state;

      return {
        ...state,
        [action.payload.id]: {
          ...failedUpload,
          status: "failed",
          errorDetails: action.payload.error,
        },
      };
    }

    case "REMOVE_UPLOAD": {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [action.payload.id]: removed, ...rest } = state;
      return rest;
    }

    case "CLEAR_ALL_UPLOADS": {
      return {};
    }

    case "SET_CONFLICT_DATA": {
      const conflictUpload = state[action.payload.id];
      if (!conflictUpload) return state;

      return {
        ...state,
        [action.payload.id]: {
          ...conflictUpload,
          file: action.payload.file,
          parentNode: action.payload.parentNode,
        },
      };
    }

    case "CLEAR_CONFLICTED_UPLOADS": {
      // Filter out all uploads with status "conflict"
      const filteredUploads: UploadsState = {};
      for (const [id, upload] of Object.entries(state)) {
        if (upload && upload.status !== "conflict") {
          filteredUploads[id] = upload;
        }
      }
      return filteredUploads;
    }

    default:
      return state;
  }
}

// Hook
export function useUploadTracker(useLocalStorage = false, driveId?: string) {
  const getInitialState = useCallback((): UploadsState => {
    if (useLocalStorage && driveId) {
      try {
        const stored = localStorage.getItem(`uploadTracker_${driveId}`);
        if (stored) {
          const parsed = JSON.parse(stored) as UploadsState;
          return parsed;
        }
        return {};
      } catch (error) {
        console.error(
          "Failed to load upload tracker from localStorage:",
          error,
        );
        return {};
      }
    }
    return {};
  }, [useLocalStorage, driveId]);

  const [uploads, dispatch] = useReducer(uploadsReducer, getInitialState());

  // Save to localStorage whenever uploads change
  useEffect(() => {
    if (useLocalStorage && driveId) {
      try {
        localStorage.setItem(
          `uploadTracker_${driveId}`,
          JSON.stringify(uploads),
        );
      } catch (error) {
        console.error("Failed to save upload tracker to localStorage:", error);
      }
    }
  }, [uploads, useLocalStorage, driveId]);

  const createUploadHandler = useCallback(
    (onAddFile?: OnAddFileWithProgress) => {
      if (!onAddFile) return undefined;

      return async (file: File, parent: Node | undefined) => {
        const fileId = generateId();

        // Add upload to tracking
        dispatch({
          type: "ADD_UPLOAD",
          payload: {
            id: fileId,
            fileName: file.name,
            fileSize: formatFileSize(file.size),
          },
        });

        // Create progress callback for this specific file
        const progressCallback = (progress: FileUploadProgress) => {
          dispatch({
            type: "UPDATE_PROGRESS",
            payload: {
              id: fileId,
              progress,
            },
          });

          // Store file and parent data when conflict is detected
          if (progress.stage === "conflict") {
            dispatch({
              type: "SET_CONFLICT_DATA",
              payload: {
                id: fileId,
                file,
                parentNode: parent,
              },
            });
          }
        };

        try {
          // Call the original onAddFile with our progress callback
          const fileNode = await onAddFile(file, parent, progressCallback);

          // Store the FileNode
          dispatch({
            type: "SET_FILE_NODE",
            payload: {
              id: fileId,
              fileNode: fileNode || undefined,
            },
          });
        } catch (error) {
          dispatch({
            type: "SET_ERROR",
            payload: {
              id: fileId,
              error: error instanceof Error ? error.message : "Unknown error",
            },
          });
        }
      };
    },
    [],
  );

  const removeUpload = useCallback((uploadId: string) => {
    dispatch({
      type: "REMOVE_UPLOAD",
      payload: {
        id: uploadId,
      },
    });
  }, []);

  const clearAllUploads = useCallback(() => {
    dispatch({
      type: "CLEAR_ALL_UPLOADS",
    });
  }, []);

  const clearConflictedUploads = useCallback(() => {
    dispatch({
      type: "CLEAR_CONFLICTED_UPLOADS",
    });
  }, []);

  const getUploadsArray = useCallback(() => {
    return Object.values(uploads);
  }, [uploads]);

  const getUploadsCount = useCallback(() => {
    return Object.keys(uploads).length;
  }, [uploads]);

  const resolveConflict = useCallback(
    (
      uploadId: string,
      resolution: ConflictResolution,
      onAddFile?: OnAddFileWithProgress,
    ) => {
      const upload = uploads[uploadId];
      if (!upload?.file || !onAddFile) {
        console.error(
          "Cannot resolve conflict: missing upload data or onAddFile function",
        );
        return;
      }

      // Re-call onAddFile with the conflict resolution
      const progressCallback = (progress: FileUploadProgress) => {
        dispatch({
          type: "UPDATE_PROGRESS",
          payload: {
            id: uploadId,
            progress,
          },
        });
      };

      const result = onAddFile(
        upload.file,
        upload.parentNode,
        progressCallback,
        resolution,
      );

      // Handle both Promise and direct return values
      Promise.resolve(result)
        .then((fileNode: Node | undefined) => {
          if (fileNode) {
            dispatch({
              type: "SET_FILE_NODE",
              payload: {
                id: uploadId,
                fileNode,
              },
            });
          }
        })
        .catch((error: unknown) => {
          dispatch({
            type: "SET_ERROR",
            payload: {
              id: uploadId,
              error: error instanceof Error ? error.message : "Unknown error",
            },
          });
        });
    },
    [uploads],
  );

  return {
    uploads,
    uploadsArray: getUploadsArray(),
    uploadsCount: getUploadsCount(),
    createUploadHandler,
    removeUpload,
    clearAllUploads,
    clearConflictedUploads,
    resolveConflict,
  };
}
