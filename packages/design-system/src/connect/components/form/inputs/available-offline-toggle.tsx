import type { ComponentPropsWithRef, ForwardedRef } from "react";
import { forwardRef } from "react";
import { Toggle } from "../../toggle/toggle.js";

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
      <div className="flex items-center rounded-md border border-border bg-background p-3 text-foreground">
        <div className="flex-1">
          <label
            className="font-medium text-foreground"
            htmlFor="availableOffline"
          >
            Make available offline
          </label>
          <p className="text-xs text-foreground">
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
