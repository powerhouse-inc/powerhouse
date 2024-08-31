import {
    InferDocumentLocalState,
    InferDocumentOperation,
    InferDocumentState,
    IReadMoveDriveServer,
    ReadDocumentNotFoundError,
    ReadDrive,
    ReadDriveContext,
    ReadDriveNotFoundError,
    ReadDrivesListener,
    ReadDrivesListenerUnsubscribe,
    ReadDriveSlugNotFoundError,
    RemoteDriveOptions,
} from 'document-drive';
import { ListenerFilter } from 'document-model-libs/document-drive';
import { Document, DocumentModel } from 'document-model/document';
import { DocumentModelNotFoundError } from 'node_modules/document-drive/src/server/error';
import {
    createContext,
    FC,
    ReactNode,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { drivesToHash } from 'src/hooks/useDocumentDrives';
import { logger } from 'src/services/logger';
import { DefaultDocumentDriveServer } from 'src/utils/document-drive-server';

export interface IReadModeContext extends IReadMoveDriveServer {
    readDrives: ReadDrive[];
    setDocumentDrive(documentDrive: IReadMoveDriveServer): void;
}

// decorator method to ensure server is defined before calling it
function checkServer<
    T extends IReadModeContext & { server: IReadMoveDriveServer | undefined },
    U extends any[],
    R,
>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<(this: T, ...args: U) => any>,
): void {
    const originalMethod = descriptor.value!;

    descriptor.value = function (this: T, ...args: U): any {
        if (!this.server) {
            throw new Error('Read mode document drive not initialized.');
        }
        return originalMethod.apply(this, args) as T;
    };
}

function bindClassMethods(instance: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const prototype = Object.getPrototypeOf(instance);
    const propertyNames = Object.getOwnPropertyNames(prototype);

    propertyNames.forEach(name => {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        if (
            descriptor &&
            typeof descriptor.value === 'function' &&
            name !== 'constructor'
        ) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            instance[name] = instance[name].bind(instance);
        }
    });
}

class ReadModeContextImpl implements Omit<IReadModeContext, 'readDrives'> {
    private server?: IReadMoveDriveServer;

    constructor(documentDrive?: IReadMoveDriveServer) {
        bindClassMethods(this);
        this.server = documentDrive;
    }

    setDocumentDrive(documentDrive: IReadMoveDriveServer) {
        this.server = documentDrive;
    }

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    @checkServer
    migrateReadDrive(id: string, options: RemoteDriveOptions) {
        return this.server!.migrateReadDrive(id, options);
    }

    @checkServer
    addReadDrive(url: string, filter?: ListenerFilter) {
        return this.server!.addReadDrive(url, filter);
    }

    @checkServer
    getReadDrives(): Promise<string[]> {
        return this.server!.getReadDrives();
    }

    @checkServer
    getReadDriveBySlug(
        slug: string,
    ): Promise<ReadDrive | ReadDriveSlugNotFoundError> {
        return this.server!.getReadDriveBySlug(slug);
    }

    @checkServer
    getReadDrive(id: string): Promise<ReadDrive | ReadDriveNotFoundError> {
        return this.server!.getReadDrive(id);
    }

    @checkServer
    getReadDriveContext(
        id: string,
    ): Promise<ReadDriveContext | ReadDriveNotFoundError> {
        return this.server!.getReadDriveContext(id);
    }

    @checkServer
    fetchDrive(id: string): Promise<ReadDrive | ReadDriveNotFoundError> {
        return this.server!.fetchDrive(id);
    }

    @checkServer
    fetchDocument<D extends Document>(
        driveId: string,
        documentId: string,
        documentType: DocumentModel<
            InferDocumentState<D>,
            InferDocumentOperation<D>,
            InferDocumentLocalState<D>
        >['documentModel']['id'],
    ): Promise<
        | Document<
              InferDocumentState<D>,
              InferDocumentOperation<D>,
              InferDocumentLocalState<D>
          >
        | DocumentModelNotFoundError
        | ReadDriveNotFoundError
        | ReadDocumentNotFoundError
    > {
        return this.server!.fetchDocument<D>(driveId, documentId, documentType);
    }

    @checkServer
    deleteReadDrive(id: string): Promise<ReadDriveNotFoundError | undefined> {
        return this.server!.deleteReadDrive(id);
    }

    @checkServer
    onReadDrivesUpdate(
        listener: ReadDrivesListener,
    ): Promise<ReadDrivesListenerUnsubscribe> {
        return this.server!.onReadDrivesUpdate(listener);
    }
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
}

const ReadModeInstance = new ReadModeContextImpl(DefaultDocumentDriveServer);

export const ReadModeContext = createContext<IReadModeContext>({
    ...(ReadModeInstance as Omit<IReadModeContext, 'readDrives'>),
    readDrives: [],
});

export interface ReadModeContextProviderProps {
    children: ReactNode;
}

export const ReadModeContextProvider: FC<
    ReadModeContextProviderProps
> = props => {
    const [readDrives, setReadDrives] = useState<ReadDrive[]>([]);

    useEffect(() => {
        const unsubscribe = ReadModeInstance.onReadDrivesUpdate(newDrives => {
            setReadDrives(readDrives =>
                readDrives.length !== newDrives.length ||
                drivesToHash(readDrives) !== drivesToHash(newDrives)
                    ? newDrives
                    : readDrives,
            );
        }).catch(logger.error);
        return () => {
            unsubscribe.then(unsub => unsub?.()).catch(logger.error);
        };
    }, []);

    const context = useMemo(() => {
        return {
            ...(ReadModeInstance as Omit<IReadModeContext, 'readDrives'>),
            readDrives,
        };
    }, [readDrives]);

    return <ReadModeContext.Provider {...props} value={context} />;
};
export const useReadModeContext = () => useContext(ReadModeContext);
