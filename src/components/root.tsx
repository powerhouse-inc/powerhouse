import { ReactComponent as IconConnect } from '@/assets/icons/connect.svg';
import { ReactComponent as IconLogo } from '@/assets/icons/logo.svg';
import { utils } from '@acaldas/document-model-libs/browser/budget-statement';
import { useAtomValue, useSetAtom } from 'jotai';
import React, { Suspense, useEffect } from 'react';
import { useDrop } from 'react-aria';
import { Outlet, useNavigate } from 'react-router-dom';
import { themeAtom, userAtom } from '../store';
import { Tab, TabBudgetStatement, useTabs } from '../store/tabs';
import Sidebar from './sidebar';

export default () => {
    const ref = React.useRef(null);
    const theme = useAtomValue(themeAtom);
    const { addTab } = useTabs();
    const navigate = useNavigate();
    const setUser = useSetAtom(userAtom);

    useEffect(() => {
        window.electronAPI?.ready();

        window.electronAPI?.user().then(user => {
            setUser(user);
        });

        window.electronAPI?.handleLogin((_, user) => {
            setUser(user);
        });
    }, []);

    const { dropProps, isDropTarget } = useDrop({
        ref,
        async onDrop(e) {
            for (const item of e.items) {
                if (item.kind === 'file') {
                    const file = await item.getFile();
                    const budget = await utils.loadBudgetStatementFromInput(
                        file
                    );
                    const tab = new TabBudgetStatement(budget);
                    addTab(tab);
                    navigate('/');
                } else if (item.kind === 'text') {
                    try {
                        const tabStr = await item.getText('tab');
                        const tab = Tab.fromString(tabStr);
                        addTab(tab);
                        navigate('/');
                    } catch (error) {
                        console.log(
                            `Dropped text not recognized as tab: ${error}`
                        );
                        console.log(item);
                    }
                }
            }
        },
    });
    const isMac = window.navigator.appVersion.indexOf('Mac') != -1;

    return (
        <div className={`theme-${theme} h-screen text-text`}>
            <div
                className={`h-[30px] w-full
                ${isMac && 'justify-center'}
                z-90 flex items-center bg-toolbar
                [-webkit-app-region:drag]`}
            >
                <IconLogo className="ml-1 mr-[2px] p-[6px]" />
                <IconConnect className="h-3 w-fit" />
            </div>
            <div
                className={`h-[calc(100vh-30px)] overflow-auto ${
                    isDropTarget ? 'bg-light' : 'bg-bg'
                } flex items-stretch`}
                {...dropProps}
                role="presentation"
                tabIndex={0}
            >
                <Suspense>
                    <Sidebar />
                    <div className="relative flex-1 overflow-auto">
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
        </div>
    );
};
