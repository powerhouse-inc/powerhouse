import type { Node } from "document-drive";
import { useCallback, useReducer } from "react";
import {
  type FileUploadProgress,
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

    default:
      return state;
  }
}

// Hook
export function useUploadTracker() {
  const [uploads, dispatch] = useReducer(uploadsReducer, {});

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

  const getUploadsArray = useCallback(() => {
    return Object.values(uploads);
  }, [uploads]);

  const getUploadsCount = useCallback(() => {
    return Object.keys(uploads).length;
  }, [uploads]);

  return {
    uploads,
    uploadsArray: getUploadsArray(),
    uploadsCount: getUploadsCount(),
    createUploadHandler,
    removeUpload,
    clearAllUploads,
  };
}
