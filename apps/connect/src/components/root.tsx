import { utils } from '@acaldas/document-model-libs/browser/budget-statement';
import { useAtomValue } from 'jotai';
import React, { Suspense } from 'react';
import { useDrop } from 'react-aria';
import { FileDropItem } from 'react-aria-components';
import { Outlet, useNavigate } from 'react-router-dom';
import { themeAtom } from '../store';
import { useTabs } from '../store/tabs';
import Sidebar from './sidebar';

export default () => {
    const ref = React.useRef(null);
    const theme = useAtomValue(themeAtom);
    const { addBudgetStatementTab } = useTabs();
    const navigate = useNavigate();

    const { dropProps, isDropTarget } = useDrop({
        ref,
        async onDrop(e) {
            const files = e.items.filter(
                item => item.kind === 'file'
            ) as FileDropItem[];
            files.forEach(async item => {
                const file = await item.getFile();
                const budget = await utils.loadBudgetStatementFromInput(file);
                addBudgetStatementTab(budget);
                navigate('/');
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
        >
            <Suspense>
                <Sidebar />
                <div className="relative mx-8 flex-1 overflow-auto">
                    <Outlet />
                </div>
                <div
                    ref={ref}
                    className={`pointer-events-none fixed inset-0 bg-current
                        transition-opacity duration-150 ease-in-out
                        ${isDropTarget ? 'opacity-10' : 'opacity-0'}
                    `}
                ></div>
            </Suspense>
        </div>
    );
};
