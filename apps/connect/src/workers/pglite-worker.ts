import type { IdbFs } from '@electric-sql/pglite';
import { type PGliteWorkerOptions, worker } from '@electric-sql/pglite/worker';

interface PGLiteWorkerOptions extends PGliteWorkerOptions {
    meta: {
        databaseName: string;
    };
}

worker({
    async init(options) {
        const databaseName = (options as PGLiteWorkerOptions).meta.databaseName;
        if (!databaseName) {
            throw new Error('Database name not provided');
        }

        const { IdbFs, PGlite } = await import('@electric-sql/pglite');

        const idbFs: IdbFs = new IdbFs(databaseName);
        // Create and return a PGlite instance
        const db = new PGlite({
            fs: idbFs,
            relaxedDurability: true,
        });

        return db;
    },
}).catch((error: unknown) => {
    console.error('Error initializing PGlite worker:', error);
    throw error;
});
