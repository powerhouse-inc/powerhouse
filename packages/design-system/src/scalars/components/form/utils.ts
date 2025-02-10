export interface SupportedErrorObject extends Error {
  data: {
    path?: string;
    message?: string;
  }[];
}

export const isSupportedErrorObject = (
  error: object,
): error is SupportedErrorObject => {
  return (
    typeof error === "object" &&
    Object.hasOwn(error, "data") &&
    Array.isArray((error as { data?: unknown }).data)
  );
};

export const defaultOnError = (
  error: Error,
  fieldNames: string[],
): Record<string, string> => {
  let message = "An error occurred while submitting the data";
  let formErrorPath = "root.serverError"; // form level error by default

  if (typeof error === "object" && isSupportedErrorObject(error)) {
    const path = error.data[0]?.path;
    if (error.data[0]?.message) {
      message = error.data[0].message;
    }
    if (Array.isArray(path)) {
      // maybe we can reconciliate this error with a form field
      if (path.length === 1 && fieldNames.includes(path[0])) {
        formErrorPath = path[0];
      }
    }
  }

  return {
    [formErrorPath]: message,
  };
};
