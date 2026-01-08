import type { StateValidationError } from "../utils/helpers.js";

export function StateValidationErrorMessage({
  error,
}: {
  error: StateValidationError;
}) {
  const { payload } = error;

  switch (payload.kind) {
    case "MISSING":
      return (
        <span>
          Field <strong>{payload.field}</strong> is missing.
        </span>
      );

    case "UNKNOWN_FIELD":
      return (
        <span>
          Field <strong>{payload.field}</strong> is not a known field.
        </span>
      );

    case "NON_NULL":
      return (
        <span>
          Field <strong>{payload.field}</strong> cannot be null.
        </span>
      );

    case "TYPE":
      return (
        <span>
          Field <strong>{payload.field}</strong>
          {payload.expectedType ? (
            <>
              {" "}
              must be a{" "}
              <strong>{payload.expectedType.replace(/!/g, "")}</strong>.
            </>
          ) : (
            <> has an invalid value.</>
          )}
        </span>
      );

    default:
      return <span>Invalid value.</span>;
  }
}
