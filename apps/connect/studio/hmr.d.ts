import 'vite/types/customEvent.d.ts';

declare module 'vite/types/customEvent.d.ts' {
    interface CustomEventMap {
        'studio:add-external-package': { name: string };
        // 'event-key': payload
    }

    type CustomEventKeys = keyof CustomEventMap;
}
