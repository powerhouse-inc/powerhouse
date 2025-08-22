import type { DocumentDriveServerOptions } from 'document-drive';

/**
 * Supported drive preservation strategies
 */
const SUPPORTED_STRATEGIES = [
    'preserve-all',
    'preserve-by-url-and-detach',
] as const;

type SupportedStrategy = (typeof SUPPORTED_STRATEGIES)[number];

/**
 * Get the drive preservation strategy from environment variable
 * @returns Valid strategy or default 'preserve-by-url-and-detach'
 */
export const getDrivePreservationStrategy = (): SupportedStrategy => {
    const envStrategy = import.meta.env.PH_CONNECT_DRIVES_PRESERVE_STRATEGY as
        | string
        | undefined;

    if (!envStrategy) {
        return 'preserve-by-url-and-detach';
    }

    const isValidStrategy = (
        strategy: string,
    ): strategy is SupportedStrategy => {
        return SUPPORTED_STRATEGIES.includes(strategy as SupportedStrategy);
    };

    return isValidStrategy(envStrategy)
        ? envStrategy
        : 'preserve-by-url-and-detach';
};

/**
 * Create the removeOldRemoteDrives configuration based on strategy and drive URLs
 * @param defaultDrivesUrl Array of default drive URLs
 * @returns RemoveOldRemoteDrives configuration
 */
export const createRemoveOldRemoteDrivesConfig = (
    defaultDrivesUrl: string[],
): NonNullable<
    DocumentDriveServerOptions['defaultDrives']
>['removeOldRemoteDrives'] => {
    if (defaultDrivesUrl.length === 0) {
        return { strategy: 'preserve-all' };
    }

    const strategy: SupportedStrategy = getDrivePreservationStrategy();

    switch (strategy) {
        case 'preserve-all':
            return { strategy: 'preserve-all' };
        case 'preserve-by-url-and-detach':
            return {
                strategy: 'preserve-by-url-and-detach',
                urls: defaultDrivesUrl,
            };
        default:
            // TypeScript exhaustiveness check - should never reach here
            return {
                strategy: 'preserve-by-url-and-detach',
                urls: defaultDrivesUrl,
            };
    }
};
