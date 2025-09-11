import { DefaultEditorLoader } from "@powerhousedao/design-system";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useState } from "react";

type Props = ComponentProps<typeof DefaultEditorLoader> & {
  loadingTimeout?: number;
  customEditorLoader?: ReactNode;
};
export function EditorLoader(props: Props) {
  const [showLoading, setShowLoading] = useState(false);

  // only shows the loader after some time has passed
  useEffect(() => {
    setTimeout(() => {
      setShowLoading(true);
    }, props.loadingTimeout ?? 200);
  }, [props]);

  if (!showLoading) return null;

  const { customEditorLoader, ...defaultProps } = props;

  if (customEditorLoader) return <>{customEditorLoader}</>;

  return <DefaultEditorLoader {...defaultProps} />;
}
