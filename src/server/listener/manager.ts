import {
    ListenerCallInfo,
    ListenerFilter
} from 'document-model-libs/document-drive';
import { OperationScope } from 'document-model/document';
import { OperationError } from '../error';
import {
    BaseListenerManager,
    ErrorStatus,
    Listener,
    ListenerState,
    ListenerUpdate,
    OperationUpdate,
    StrandUpdate,
    SynchronizationUnit
} from '../types';
import { PullResponderTransmitter } from './transmitter';
import { InternalTransmitter } from './transmitter/internal';
import { SwitchboardPushTransmitter } from './transmitter/switchboard-push';
import { ITransmitter } from './transmitter/types';

export class ListenerManager extends BaseListenerManager {
    async getTransmitter(
        driveId: string,
        listenerId: string
    ): Promise<ITransmitter | undefined> {
        return this.transmitters[driveId]?.[listenerId];
    }

    async addListener(listener: Listener) {
        const drive = listener.driveId;

        const syncUnits = await this.drive.getSynchronizationUnits(drive);
        const filteredSyncUnits = [];
        for (const syncUnit of syncUnits) {
            if (this._checkFilter(listener.filter, syncUnit)) {
                filteredSyncUnits.push(syncUnit);
            }
        }

        if (!this.listenerState.has(drive)) {
            this.listenerState.set(drive, new Map());
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const driveMap = this.listenerState.get(drive)!;
        driveMap.set(listener.listenerId, {
            block: listener.block,
            driveId: listener.driveId,
            pendingTimeout: '0',
            listener,
            listenerStatus: 'CREATED',
            syncUnits: filteredSyncUnits.map(e => ({
                ...e,
                listenerRev: -1,
                syncRev: e.revision
            }))
        });

        let transmitter: ITransmitter | undefined;

        switch (listener.callInfo?.transmitterType) {
            case 'SwitchboardPush': {
                transmitter = new SwitchboardPushTransmitter(
                    listener,
                    this.drive
                );
                break;
            }

            case 'PullResponder': {
                transmitter = new PullResponderTransmitter(
                    listener,
                    this.drive,
                    this
                );
                break;
            }
            case 'Internal': {
                transmitter = new InternalTransmitter(listener, this.drive);
                break;
            }
        }

        if (!transmitter) {
            throw new Error('Transmitter not found');
        }

        const driveTransmitters = this.transmitters[drive] || {};
        driveTransmitters[listener.listenerId] = transmitter;
        this.transmitters[drive] = driveTransmitters;
        return transmitter;
    }

    async removeListener(driveId: string, listenerId: string) {
        const driveMap = this.listenerState.get(driveId);
        if (!driveMap) {
            return false;
        }

        return driveMap.delete(listenerId);
    }

    async updateSynchronizationRevision(
        driveId: string,
        syncId: string,
        syncRev: number,
        lastUpdated: string,
        willUpdate?: (listeners: Listener[]) => void,
        onError?: (
            error: Error,
            driveId: string,
            listener: ListenerState
        ) => void
    ) {
        const drive = this.listenerState.get(driveId);
        if (!drive) {
            return [];
        }

        const outdatedListeners: Listener[] = [];
        for (const [, listener] of drive) {
            const syncUnits = listener.syncUnits.filter(
                e => e.syncId === syncId
            );
            if (listener.driveId !== driveId) {
                continue;
            }

            for (const syncUnit of syncUnits) {
                if (syncUnit.syncId !== syncId) {
                    continue;
                }

                syncUnit.syncRev = syncRev;
                syncUnit.lastUpdated = lastUpdated;
                if (
                    !outdatedListeners.find(
                        l => l.listenerId === listener.listener.listenerId
                    )
                ) {
                    outdatedListeners.push(listener.listener);
                }
            }
        }

        if (outdatedListeners.length) {
            willUpdate?.(outdatedListeners);
            return this.triggerUpdate(onError);
        }
        return [];
    }

    async addSyncUnits(syncUnits: SynchronizationUnit[]) {
        for (const [driveId, drive] of this.listenerState) {
            for (const [id, listenerState] of drive) {
                const transmitter = await this.getTransmitter(driveId, id);
                if (!transmitter) {
                    continue;
                }
                const filteredSyncUnits = [];
                const { listener } = listenerState;
                for (const syncUnit of syncUnits) {
                    if (!this._checkFilter(listener.filter, syncUnit)) {
                        continue;
                    }
                    const existingSyncUnit = listenerState.syncUnits.find(
                        unit => unit.syncId === syncUnit.syncId
                    );
                    if (existingSyncUnit) {
                        existingSyncUnit.syncRev = syncUnit.revision;
                        existingSyncUnit.lastUpdated = syncUnit.lastUpdated;
                    } else {
                        filteredSyncUnits.push(syncUnit);
                    }
                }

                // TODO is this possible?
                if (!this.listenerState.has(driveId)) {
                    this.listenerState.set(driveId, new Map());
                }

                const driveMap = this.listenerState.get(driveId)!;

                // TODO reuse existing state
                driveMap.set(listener.listenerId, {
                    block: listener.block,
                    driveId: listener.driveId,
                    pendingTimeout: '0',
                    listener,
                    listenerStatus: 'CREATED',
                    syncUnits: listenerState.syncUnits.concat(
                        filteredSyncUnits.map(e => ({
                            ...e,
                            listenerRev: -1,
                            syncRev: e.revision
                        }))
                    )
                });
            }
        }
    }

    removeSyncUnits(syncUnits: SynchronizationUnit[]) {
        for (const [driveId, drive] of this.listenerState) {
            const syncIds = syncUnits
                .filter(s => s.driveId === driveId)
                .map(s => s.syncId);
            for (const [, listenerState] of drive) {
                listenerState.syncUnits = listenerState.syncUnits.filter(
                    s => !syncIds.includes(s.syncId)
                );
            }
        }
    }

    async updateListenerRevision(
        listenerId: string,
        driveId: string,
        syncId: string,
        listenerRev: number
    ): Promise<void> {
        const drive = this.listenerState.get(driveId);
        if (!drive) {
            return;
        }

        const listener = drive.get(listenerId);
        if (!listener) {
            return;
        }

        const entry = listener.syncUnits.find(s => s.syncId === syncId);
        if (entry) {
            entry.listenerRev = listenerRev;
            entry.lastUpdated = new Date().toISOString();
        }
    }

    async triggerUpdate(
        onError?: (
            error: Error,
            driveId: string,
            listener: ListenerState
        ) => void
    ) {
        const listenerUpdates: ListenerUpdate[] = [];
        for (const [driveId, drive] of this.listenerState) {
            for (const [id, listener] of drive) {
                const transmitter = await this.getTransmitter(driveId, id);
                if (!transmitter) {
                    continue;
                }

                const strandUpdates: StrandUpdate[] = [];
                for (const unit of listener.syncUnits) {
                    const {
                        syncRev,
                        syncId,
                        listenerRev,
                        driveId,
                        documentId,
                        scope,
                        branch
                    } = unit;
                    if (listenerRev >= syncRev) {
                        continue;
                    }

                    const opData: OperationUpdate[] = [];
                    try {
                        const data = await this.drive.getOperationData(
                            driveId,
                            syncId,
                            {
                                fromRevision: listenerRev
                            }
                        );
                        opData.push(...data);
                    } catch (e) {
                        console.error(e);
                    }

                    if (!opData.length) {
                        continue;
                    }

                    strandUpdates.push({
                        driveId,
                        documentId,
                        branch,
                        operations: opData,
                        scope: scope as OperationScope
                    });
                }

                if (strandUpdates.length == 0) {
                    continue;
                }

                listener.pendingTimeout = new Date(
                    new Date().getTime() / 1000 + 300
                ).toISOString();
                listener.listenerStatus = 'PENDING';

                // TODO update listeners in parallel, blocking for listeners with block=true
                try {
                    const listenerRevisions =
                        await transmitter?.transmit(strandUpdates);

                    listener.pendingTimeout = '0';
                    listener.listenerStatus = 'PENDING';

                    for (const unit of listener.syncUnits) {
                        const revision = listenerRevisions.find(
                            e =>
                                e.documentId === unit.documentId &&
                                e.scope === unit.scope &&
                                e.branch === unit.branch
                        );
                        if (revision) {
                            unit.listenerRev = revision.revision;
                        }
                    }
                    const revisionError = listenerRevisions.find(
                        l => l.status !== 'SUCCESS'
                    );
                    if (revisionError) {
                        throw new OperationError(
                            revisionError.status as ErrorStatus,
                            undefined
                        );
                    }
                    listener.listenerStatus = 'SUCCESS';
                    listenerUpdates.push({
                        listenerId: listener.listener.listenerId,
                        listenerRevisions
                    });
                } catch (e) {
                    // TODO: Handle error based on listener params (blocking, retry, etc)
                    onError?.(e as Error, driveId, listener);
                    listener.listenerStatus =
                        e instanceof OperationError ? e.status : 'ERROR';
                }
            }
        }
        return listenerUpdates;
    }

    private _checkFilter(
        filter: ListenerFilter,
        syncUnit: SynchronizationUnit
    ) {
        const { branch, documentId, scope, documentType } = syncUnit;
        // TODO: Needs to be optimized
        if (
            (!filter.branch ||
                filter.branch.includes(branch) ||
                filter.branch.includes('*')) &&
            (!filter.documentId ||
                filter.documentId.includes(documentId) ||
                filter.documentId.includes('*')) &&
            (!filter.scope ||
                filter.scope.includes(scope) ||
                filter.scope.includes('*')) &&
            (!filter.documentType ||
                filter.documentType.includes(documentType) ||
                filter.documentType.includes('*'))
        ) {
            return true;
        }
        return false;
    }

    async init() {
        const drives = await this.drive.getDrives();
        for (const driveId of drives) {
            const drive = await this.drive.getDrive(driveId);
            const {
                state: {
                    local: { listeners }
                }
            } = drive;

            for (const listener of listeners) {
                this.addListener({
                    block: listener.block,
                    driveId,
                    filter: {
                        branch: listener.filter.branch ?? [],
                        documentId: listener.filter.documentId ?? [],
                        documentType: listener.filter.documentType,
                        scope: listener.filter.scope ?? []
                    },
                    listenerId: listener.listenerId,
                    system: listener.system,
                    callInfo:
                        (listener.callInfo as ListenerCallInfo) ?? undefined,
                    label: listener.label ?? ''
                });
            }
        }
    }

    getListener(driveId: string, listenerId: string): Promise<ListenerState> {
        const drive = this.listenerState.get(driveId);
        if (!drive) throw new Error('Drive not found');
        const listener = drive.get(listenerId);
        if (!listener) throw new Error('Listener not found');
        return Promise.resolve(listener);
    }

    async getStrands(
        driveId: string,
        listenerId: string,
        since?: string
    ): Promise<StrandUpdate[]> {
        // fetch listenerState from listenerManager
        const entries = await this.getListener(driveId, listenerId);

        // fetch operations from drive  and prepare strands
        const strands: StrandUpdate[] = [];

        for (const entry of entries.syncUnits) {
            if (entry.listenerRev >= entry.syncRev) {
                continue;
            }

            const { documentId, driveId, scope, branch } = entry;
            const operations = await this.drive.getOperationData(
                entry.driveId,
                entry.syncId,
                {
                    since,
                    fromRevision: entry.listenerRev
                }
            );

            if (!operations.length) {
                continue;
            }

            strands.push({
                driveId,
                documentId,
                scope: scope as OperationScope,
                branch,
                operations
            });
        }

        return strands;
    }
}
