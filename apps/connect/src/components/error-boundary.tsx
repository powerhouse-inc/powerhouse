import { childLogger } from "document-drive";
import type { ReactNode } from "react";
import {
  ErrorBoundary as ReactErrorBoundary,
  type FallbackProps,
} from "react-error-boundary";

const logger = childLogger(["Connect"]);

/**
 * Available fallback UI variants for the ErrorBoundary component.
 *
 * - `"silent"` - Renders nothing when an error occurs (useful for modals)
 * - `"text"` - Displays a simple centered text message
 * - `"detailed"` - Shows full error details including message and JSON representation
 */
type ErrorFallbackVariant = "silent" | "text" | "detailed";

/**
 * Base props shared by all ErrorBoundary configurations.
 */
type BaseErrorBoundaryProps = {
  /** Content to wrap with error boundary protection */
  children: ReactNode;
  /** Optional callback invoked when an error is caught (in addition to logging) */
  onError?: (error: Error, info: React.ErrorInfo) => void;
  /** When any value in this array changes, the error boundary resets */
  resetKeys?: unknown[];
  /** Logger context path for error logging (e.g., ["Connect", "Editor"]) */
  loggerContext?: string[];
};

/**
 * Props for using a predefined fallback variant.
 */
type VariantErrorBoundaryProps = BaseErrorBoundaryProps & {
  /** The fallback UI variant to display on error */
  variant: ErrorFallbackVariant;
  /** Custom message for the "text" variant (default: "Something went wrong") */
  fallbackMessage?: string;
};

/**
 * Props for using a custom fallback render function.
 */
type CustomFallbackErrorBoundaryProps = BaseErrorBoundaryProps & {
  /** Custom render function for the fallback UI */
  fallbackRender: (props: FallbackProps) => ReactNode;
};

/**
 * Union type for all ErrorBoundary prop configurations.
 * Use either a variant or a custom fallbackRender, but not both.
 */
type ErrorBoundaryProps =
  | VariantErrorBoundaryProps
  | CustomFallbackErrorBoundaryProps;

function hasCustomFallback(
  props: ErrorBoundaryProps,
): props is CustomFallbackErrorBoundaryProps {
  return "fallbackRender" in props;
}

function SilentFallback() {
  return null;
}

/**
 * Simple text-based fallback component.
 * Displays a centered message when an error occurs.
 */
function TextFallback({
  message = "Something went wrong",
}: {
  message?: string;
}) {
  return <div className="text-center">{message}</div>;
}

/**
 * Detailed fallback component showing full error information.
 * Displays error message and JSON representation of the error object.
 * Useful for development and debugging purposes.
 */
function DetailedFallback({ error }: FallbackProps) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return (
    <div className="mx-auto flex max-w-[80%] flex-1 flex-col items-center justify-center">
      <h1 className="mb-2 text-xl font-semibold">Error</h1>
      <i>{errorMessage}</i>
      <pre>{JSON.stringify(error, null, 2)}</pre>
    </div>
  );
}

/**
 * Centered error message fallback component.
 * Displays the error message in a centered, full-size container.
 * Suitable for use as a custom fallbackRender when you need simple error display.
 */
function CenteredErrorMessage({ error }: FallbackProps) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex size-full items-center justify-center">
      <h3 className="text-lg font-semibold">{errorMessage}</h3>
    </div>
  );
}

function getFallbackComponent(
  variant: ErrorFallbackVariant,
  fallbackMessage?: string,
): (props: FallbackProps) => ReactNode {
  switch (variant) {
    case "silent":
      return SilentFallback;
    case "text":
      return () => <TextFallback message={fallbackMessage} />;
    case "detailed":
      return DetailedFallback;
    default:
      return CenteredErrorMessage;
  }
}

/**
 * Unified error boundary component for catching and handling React errors.
 *
 * Built on top of `react-error-boundary`, this component provides:
 * - Automatic error logging with configurable context
 * - Multiple fallback UI variants (silent, text, detailed)
 * - Support for custom fallback render functions
 * - Reset capability via `resetKeys`
 *
 * @example
 * // Using a predefined variant
 * <ErrorBoundary variant="detailed" loggerContext={["Connect", "Editor"]}>
 *   <EditorComponent />
 * </ErrorBoundary>
 *
 * @example
 * // Using a custom message with the text variant
 * <ErrorBoundary variant="text" fallbackMessage="Failed to load drives">
 *   <DrivesList />
 * </ErrorBoundary>
 *
 * @example
 * // Using a custom fallback render
 * <ErrorBoundary
 *   fallbackRender={CenteredErrorMessage}
 *   onError={(error) => trackError(error)}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * @example
 * // Silent mode for modals (renders null on error)
 * <ErrorBoundary variant="silent" loggerContext={["Connect", "Modals"]}>
 *   <ModalContent />
 * </ErrorBoundary>
 */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  const { children, onError, resetKeys, loggerContext } = props;

  const handleError = (error: Error, info: React.ErrorInfo) => {
    if (
      error.message.includes("Failed to fetch dynamically imported module") &&
      error.message.includes("node_modules/.vite")
    ) {
      console.error(error);
      console.log("Outdated chunk detected, reloading page...");
      window.location.reload();
      return;
    }

    const contextLogger = loggerContext ? childLogger(loggerContext) : logger;
    contextLogger.error("@error @info", error, info);
    onError?.(error, info);
  };

  const fallbackRender = hasCustomFallback(props)
    ? props.fallbackRender
    : getFallbackComponent(props.variant, props.fallbackMessage);

  return (
    <ReactErrorBoundary
      fallbackRender={fallbackRender}
      onError={handleError}
      resetKeys={resetKeys}
    >
      {children}
    </ReactErrorBoundary>
  );
}

export { CenteredErrorMessage, DetailedFallback, TextFallback };
export type { FallbackProps };
