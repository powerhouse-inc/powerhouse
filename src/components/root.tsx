import { utils } from '@acaldas/document-model-libs/browser/budget-statement';
import { useAtomValue } from 'jotai';
import React, { Suspense } from 'react';
import { useDrop } from 'react-aria';
import { FileDropItem } from 'react-aria-components';
import { Outlet } from 'react-router-dom';
import { themeAtom } from '../store';
import Sidebar from './sidebar';

export default () => {
    const ref = React.useRef(null);

    const theme = useAtomValue(themeAtom);

    const { dropProps, isDropTarget } = useDrop({
        ref,
        async onDrop(e) {
            const files = e.items.filter(
                item => item.kind === 'file'
            ) as FileDropItem[];
            files.forEach(async item => {
                const file = await item.getFile();
                const budget = await utils.loadBudgetStatementFromInput(file);
                // handleNewBudgetStatement(budget); // TODO
            });
        },
    });
    return (
        <div
            className={`theme-${theme} h-screen overflow-auto ${
                isDropTarget ? 'bg-light' : 'bg-bg'
            } flex items-stretch text-text`}
            {...dropProps}
            role="presentation"
            tabIndex={0}
            ref={ref}
        >
            <Suspense>
                <Sidebar />
                <div className="ml-10 flex-1 overflow-auto">
                    <Outlet />
                </div>
            </Suspense>
        </div>
    );
};
