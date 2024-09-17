import { TooltipProvider } from '@/connect';
import { Pagination, usePagination } from '@/powerhouse';
import { useMemo, useState } from 'react';
import { Header } from './header';
import { Timeline } from './timeline';
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

    const visibleOperations = useMemo(() => {
        const operations =
            scope === 'global' ? globalOperations : localOperations;
        return operations.sort((a, b) => b.index - a.index);
    }, [globalOperations, localOperations, scope]);

    const {
        pageItems,
        pages,
        goToPage,
        goToNextPage,
        goToPreviousPage,
        goToFirstPage,
        goToLastPage,
        hiddenNextPages,
        isNextPageAvailable,
        isPreviousPageAvailable,
    } = usePagination(visibleOperations, {
        itemsPerPage: 100,
    });

    function onChangeScope(scope: Scope) {
        goToFirstPage();
        setScope(scope);
    }

    return (
        <TooltipProvider>
            <Header
                title={documentTitle}
                docId={documentId}
                scope={scope}
                onChangeScope={onChangeScope}
                onClose={onClose}
            />
            <div className="mt-2 flex w-full justify-end">
                <Pagination
                    pages={pages}
                    hiddenNextPages={hiddenNextPages}
                    goToFirstPage={goToFirstPage}
                    goToLastPage={goToLastPage}
                    goToNextPage={goToNextPage}
                    goToPage={goToPage}
                    goToPreviousPage={goToPreviousPage}
                    isNextPageAvailable={isNextPageAvailable}
                    isPreviousPageAvailable={isPreviousPageAvailable}
                    nextPageLabel="Next"
                    previousPageLabel="Previous"
                    firstPageLabel="First Page"
                    lastPageLabel="Last Page"
                />
            </div>
            <div className="mt-9 flex justify-center rounded-md bg-slate-50 p-4">
                <div className="grid grid-cols-[minmax(min-content,1018px)]">
                    <Timeline
                        scope={scope}
                        globalOperations={scope === 'global' ? pageItems : []}
                        localOperations={scope === 'local' ? pageItems : []}
                    />
                </div>
            </div>
        </TooltipProvider>
    );
}
