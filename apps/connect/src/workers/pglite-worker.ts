import { IdbFs, PGlite } from '@electric-sql/pglite';
import { type PGliteWorkerOptions, worker } from '@electric-sql/pglite/worker';

interface PGLiteWorkerOptions extends PGliteWorkerOptions {
    meta: {
        databaseName: string;
    };
}

worker({
    init(options) {
        const databaseName = (options as PGLiteWorkerOptions).meta.databaseName;
        if (!databaseName) {
            throw new Error('Database name not provided');
        }

        const idbFs: IdbFs = new IdbFs(databaseName);
        // Create and return a PGlite instance
        const db = new PGlite({
            fs: idbFs,
            relaxedDurability: true,
        });

        return Promise.resolve(db);
    },
}).catch((error: unknown) => {
    console.error('Error initializing PGlite worker:', error);
    throw error;
});
