import 'vite/types/customEvent.d.ts';

declare module 'vite/types/customEvent.d.ts' {
    interface CustomEventMap {
        'studio:add-external-package': { name: string };
        'studio:remove-external-package': { name: string };
        'studio:external-package-added': { name: string };
        'studio:external-package-removed': { name: string };
    }

    type CustomEventKeys = keyof CustomEventMap;
}
