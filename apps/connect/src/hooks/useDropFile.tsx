import { utils } from '@acaldas/document-model-libs/browser/budget-statement';
import { useDrop } from 'react-aria';
import { useNavigate } from 'react-router-dom';
import { Tab, TabBudgetStatement, useTabs } from '../store';

export function useDropFile(ref: React.RefObject<HTMLElement>) {
    const { addTab } = useTabs();
    const navigate = useNavigate();

    return useDrop({
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
}
