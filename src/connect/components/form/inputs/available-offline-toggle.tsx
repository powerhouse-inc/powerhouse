import { Toggle } from '@/connect';
import { ComponentPropsWithRef, ForwardedRef, forwardRef } from 'react';

type AvailableOfflineToggleProps = Omit<
    ComponentPropsWithRef<typeof Toggle>,
    'id'
>;

export const AvailableOfflineToggle = forwardRef(
    function AvailableOfflineToggle(
        props: AvailableOfflineToggleProps,
        ref: ForwardedRef<HTMLInputElement>,
    ) {
        return (
            <div className="flex items-center rounded-xl bg-gray-100 p-3 text-slate-200">
                <div className="flex-1">
                    <label className="font-semibold" htmlFor="availableOffline">
                        Make available offline
                    </label>
                    <p className="text-xs text-gray-500">
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
