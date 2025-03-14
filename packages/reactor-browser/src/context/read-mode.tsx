/* eslint-disable react/jsx-props-no-spreading */

/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  type BaseDocumentDriveServer,
  type IDocumentDriveServer,
  type IReadModeDriveServer,
  type ReadDocumentNotFoundError,
  type ReadDrive,
  type ReadDriveContext,
  ReadDriveNotFoundError,
  type ReadDrivesListener,
  type ReadDrivesListenerUnsubscribe,
  type ReadDriveSlugNotFoundError,
  type RemoteDriveOptions,
} from "document-drive";
import { type PHDocument } from "document-model";
import {
  createContext,
  type FC,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useUserPermissions } from "../hooks/useUserPermissions.js";
import { drivesToHash } from "../utils/index.js";

const logger = {
  error: console.error,
};

// TODO: add export of this class from document-drive/src/server/error
class DocumentModelNotFoundError extends Error {
  constructor(
    public id: string,
    cause?: unknown,
  ) {
    super(`Document model "${id}" not found`, { cause });
  }
}

export interface IReadModeContext extends IReadModeDriveServer {
  readDrives: ReadDrive[];
  setDocumentDrive(documentDrive: IReadModeDriveServer): void;
}

// decorator method to ensure server is defined before calling it
function checkServer<
  T extends IReadModeContext & { server: IReadModeDriveServer | undefined },
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
      throw new Error("Read mode document drive not initialized.");
    }
    return originalMethod.apply(this, args) as T;
  };
}

function bindClassMethods(instance: any) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const prototype = Object.getPrototypeOf(instance);
  const propertyNames = Object.getOwnPropertyNames(prototype);

  propertyNames.forEach((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (
      descriptor &&
      typeof descriptor.value === "function" &&
      name !== "constructor"
    ) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      instance[name] = instance[name].bind(instance);
    }
  });
}

class ReadModeContextImpl implements Omit<IReadModeContext, "readDrives"> {
  private server?: IReadModeDriveServer;

  constructor(documentDrive?: IReadModeDriveServer) {
    bindClassMethods(this);
    this.server = documentDrive;
  }

  getServer(): IReadModeDriveServer | undefined {
    return this.server;
  }

  setDocumentDrive(documentDrive: IReadModeDriveServer) {
    this.server = documentDrive;
  }

  /* eslint-disable @typescript-eslint/no-non-null-assertion */
  @checkServer
  migrateReadDrive(id: string, options: RemoteDriveOptions) {
    return this.server!.migrateReadDrive(id, options);
  }

  @checkServer
  addReadDrive(url: string, options?: RemoteDriveOptions) {
    return this.server!.addReadDrive(url, options);
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
  fetchDocument<TDocument extends PHDocument>(
    driveId: string,
    documentId: string,
    documentType: string,
  ): Promise<
    | TDocument
    | DocumentModelNotFoundError
    | ReadDriveNotFoundError
    | ReadDocumentNotFoundError
  > {
    return this.server!.fetchDocument(driveId, documentId, documentType);
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

const ReadModeInstance = new ReadModeContextImpl();

export const ReadModeContext = createContext<IReadModeContext>({
  ...(ReadModeInstance as Omit<IReadModeContext, "readDrives">),
  readDrives: [],
});

export interface ReadModeContextProviderProps {
  children: ReactNode;
  reactorPromise: Promise<BaseDocumentDriveServer & IReadModeDriveServer>;
}

async function getReadDrives(
  instance: ReadModeContextImpl,
): Promise<ReadDrive[]> {
  const driveIds = await instance.getReadDrives();
  const drives = await Promise.all(
    driveIds.map((id) => instance.getReadDrive(id)),
  );
  return drives.filter(
    (drive) => !(drive instanceof ReadDriveNotFoundError),
  ) as ReadDrive[];
}

export const ReadModeContextProvider: FC<ReadModeContextProviderProps> = (
  props,
) => {
  const { reactorPromise, ...restProps } = props;

  const [readDrives, setReadDrives] = useState<ReadDrive[]>([]);
  const userPermissions = useUserPermissions();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    reactorPromise
      .then((reactor) => {
        ReadModeInstance.setDocumentDrive(reactor);
        setReady(true);
      })
      .catch(logger.error);
  }, [reactorPromise]);

  // updates drive access level when user permissions change
  const readMode =
    userPermissions === undefined
      ? undefined
      : !(
          userPermissions.isAllowedToCreateDocuments ||
          userPermissions.isAllowedToEditDocuments
        );
  useMemo(() => {
    // wait for user initial load
    if (!ready || readMode === undefined) {
      return;
    }

    const accessLevel = readMode ? "READ" : "WRITE";
    const server = ReadModeInstance.getServer();

    if (
      server &&
      typeof (server as IDocumentDriveServer).setAllDefaultDrivesAccessLevel ===
        "function"
    ) {
      (server as IDocumentDriveServer)
        .setAllDefaultDrivesAccessLevel(accessLevel)
        .catch(logger.error);
    }
  }, [readMode, ready]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    getReadDrives(ReadModeInstance)
      .then((drives) => setReadDrives(drives))
      .catch(logger.error);

    const unsubscribe = ReadModeInstance.onReadDrivesUpdate((newDrives) => {
      setReadDrives((readDrives) =>
        readDrives.length !== newDrives.length ||
        drivesToHash(readDrives) !== drivesToHash(newDrives)
          ? newDrives
          : readDrives,
      );
    }).catch(logger.error);
    return () => {
      unsubscribe
        .then((unsub) => {
          if (typeof unsub === "function") {
            unsub();
          }
        })
        .catch(logger.error);
    };
  }, [ready]);

  const context = useMemo(() => {
    return {
      ...(ReadModeInstance as Omit<IReadModeContext, "readDrives">),
      readDrives,
    };
  }, [readDrives]);

  return <ReadModeContext.Provider {...restProps} value={context} />;
};
export const useReadModeContext = () => useContext(ReadModeContext);
