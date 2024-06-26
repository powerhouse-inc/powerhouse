import { useState } from 'react';
import { Header } from './header';
import { Timeline } from './timeline/timeline';
import { Operation, Scope } from './types';

type Props = {
    documentTitle: string;
    documentId: string;
    globalOperations: Operation[];
    localOperations: Operation[];
    onClose: () => void;
};

export function RevisionHistory(props: Props) {
    const {
        documentTitle,
        documentId,
        globalOperations,
        localOperations,
        onClose,
    } = props;
    const [scope, setScope] = useState<Scope>('global');

    function onChangeScope(scope: Scope) {
        setScope(scope);
    }

    return (
        <div className="h-[calc(100vh-86px)]">
            <Header
                title={documentTitle}
                docId={documentId}
                scope={scope}
                onChangeScope={onChangeScope}
                onClose={onClose}
            />
            <div className="mt-9 flex h-full justify-center rounded-md bg-slate-50 py-4">
                <div className="min-w-[1018px]">
                    <Timeline
                        scope={scope}
                        globalOperations={globalOperations}
                        localOperations={localOperations}
                    />
                </div>
            </div>
        </div>
    );
}
