import connectConfig from '#connect-config';
import { type PHPackage } from '@powerhousedao/state';

const externalPackagesUrl =
    connectConfig.routerBasename + 'external-packages.js';
const externalPackagesEnabled = import.meta.env.PROD;

export async function loadExternalPackages() {
    try {
        if (!externalPackagesEnabled) return [];
        const module = (await import(
            /* @vite-ignore */ externalPackagesUrl
        )) as
            | {
                  default?: PHPackage[];
              }
            | undefined;
        if (!module?.default) return [];
        return module.default;
    } catch (error) {
        console.error(error);
        return [];
    }
}
