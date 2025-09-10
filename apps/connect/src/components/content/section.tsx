import { type DivProps } from "@powerhousedao/design-system";
import type React from "react";

export interface ContentSection extends DivProps {
  title?: string;
}

export const ContentSection: React.FC<ContentSection> = ({
  title,
  children,
  ...divProps
}) => {
  return (
    <div {...divProps}>
      {title && (
        <div className="mb-4 text-base font-semibold text-gray-600">
          {title}
        </div>
      )}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
};
