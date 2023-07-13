import { utils } from '@acaldas/document-model-libs/browser/budget-statement';
import { useAtomValue, useSetAtom } from 'jotai';
import React, { Suspense, useEffect } from 'react';
import { useDrop } from 'react-aria';
import { Outlet, useNavigate } from 'react-router-dom';
import { themeAtom, userAtom } from '../store';
import { Tab, TabBudgetStatement, useTabs } from '../store/tabs';
import Sidebar from './sidebar';
import { ReactComponent as IconLogo } from '@/assets/icons/logo.svg';
import { ReactComponent as IconConnect } from '@/assets/icons/connect.svg';

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

    return (
        <div
            className={`theme-${theme} h-screen overflow-auto ${
                isDropTarget ? 'bg-light' : 'bg-bg'
            } flex items-stretch text-text`}
            {...dropProps}
            role="presentation"
            tabIndex={0}
        >
            <div className='titlebar'>
                <IconLogo className='titlebar-logo'/>
                <IconConnect className='titlebar-title' />
            </div>
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
