import { DefaultEditorLoader } from "@powerhousedao/design-system/connect";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useState } from "react";

type Props = ComponentProps<typeof DefaultEditorLoader> & {
  /** Delay before showing, so short loads show nothing; 0 shows at once. */
  loadingTimeout?: number;
  customEditorLoader?: ReactNode;
};
export function EditorLoader(props: Props) {
  const { customEditorLoader, loadingTimeout = 200, ...defaultProps } = props;
  const [showLoading, setShowLoading] = useState(loadingTimeout <= 0);

  useEffect(() => {
    if (loadingTimeout <= 0) return;
    const timer = setTimeout(() => setShowLoading(true), loadingTimeout);
    return () => clearTimeout(timer);
  }, [loadingTimeout]);

  if (!showLoading) return null;

  if (customEditorLoader) return <>{customEditorLoader}</>;

  return <DefaultEditorLoader {...defaultProps} />;
}
