import { Toggle } from "@powerhousedao/design-system";
import type { ComponentPropsWithRef, ForwardedRef } from "react";
import { forwardRef } from "react";

type AvailableOfflineToggleProps = Omit<
  ComponentPropsWithRef<typeof Toggle>,
  "id"
>;

export const AvailableOfflineToggle = forwardRef(
  function AvailableOfflineToggle(
    props: AvailableOfflineToggleProps,
    ref: ForwardedRef<HTMLInputElement>,
  ) {
    return (
      <div className="flex items-center rounded-md border border-gray-200 bg-gray-50 p-3 text-gray-900">
        <div className="flex-1">
          <label
            className="font-medium text-gray-900"
            htmlFor="availableOffline"
          >
            Make available offline
          </label>
          <p className="text-xs text-gray-600">
            Check this options if you keep a local backup
            <br />
            available at all times.
          </p>
        </div>
        <Toggle id="availableOffline" ref={ref} {...props} />
      </div>
    );
  },
);
