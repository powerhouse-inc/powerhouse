import {
    ToastContainer as RToastContainer,
    ToastContainerProps,
    ToastContent,
    ToastOptions,
    TypeOptions,
    toast as rToast,
} from 'react-toastify';

import { Icon } from '@/powerhouse';

export type ConnectTypeOptions =
    | 'connect-success'
    | 'connect-warning'
    | 'connect-loading'
    | 'connect-deleted';

export type ExtendedTypeOptions = TypeOptions | ConnectTypeOptions;

export type ConnectToastOptions = Omit<ToastOptions, 'type'> & {
    type: ExtendedTypeOptions;
};

export function isConnectTypeOptions(
    type: ExtendedTypeOptions,
): type is ConnectTypeOptions {
    return (
        type === 'connect-success' ||
        type === 'connect-warning' ||
        type === 'connect-loading' ||
        type === 'connect-deleted'
    );
}

function getDefaultOptions(type: ExtendedTypeOptions): ToastOptions {
    if (isConnectTypeOptions(type)) {
        const options: ToastOptions = {};

        switch (type) {
            case 'connect-success':
                options.type = 'success';
                options.icon = (
                    <Icon
                        size={24}
                        name="CheckCircleFill"
                        className="text-green-800"
                    />
                );
                break;
            case 'connect-warning':
                options.type = 'warning';
                options.icon = (
                    <Icon
                        size={24}
                        name="WarningFill"
                        className="text-gray-600"
                    />
                );
                break;
            case 'connect-loading':
                options.type = 'default';
                options.icon = (
                    <Icon
                        size={24}
                        name="ClockFill"
                        className="text-gray-600"
                    />
                );
                break;
            case 'connect-deleted':
                options.type = 'error';
                options.icon = (
                    <Icon size={24} name="TrashFill" className="text-red-800" />
                );
                break;
        }

        return options;
    }

    return { type };
}

export function toast(content: ToastContent, options?: ConnectToastOptions) {
    const { type = 'default', ...restOptions } = options || {};
    const defaultOptions = getDefaultOptions(type);

    return rToast(content, { ...defaultOptions, ...restOptions });
}

const CloseButton: ToastContainerProps['closeButton'] = ({ closeToast }) => (
    <button
        onClick={closeToast}
        className="flex items-center text-gray-500 hover:text-gray-600"
    >
        <Icon name="XmarkLight" size={16} />
    </button>
);

export const ToastContainer: React.FC<ToastContainerProps> = props => (
    <RToastContainer closeButton={CloseButton} {...props} />
);
