import { IdbFs, PGlite } from '@electric-sql/pglite';
import { worker } from '@electric-sql/pglite/worker';

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
worker({
    async init(options) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const databaseName = options.meta?.databaseName as string;
        if (!databaseName) {
            throw new Error('Database name not provided');
        }
        // Create and return a PGlite instance
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        return new PGlite({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
            fs: new IdbFs(databaseName),
            relaxedDurability: true,
        });
    },
});
