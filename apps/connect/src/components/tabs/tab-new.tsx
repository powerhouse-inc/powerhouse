import {
    TabBudgetStatement,
    TabDocumentModel,
    useTabs,
} from '../../store/tabs';

export default () => {
    const { addTab } = useTabs();

    return (
        <div>
            <button
                className="underline underline-offset-4"
                onClick={() => addTab(new TabDocumentModel())}
            >
                New Document Model
            </button>
            <button
                className="px-0 underline underline-offset-4"
                onClick={() => addTab(new TabBudgetStatement())}
                style={{ marginLeft: 20 }}
            >
                New Budget Statement
            </button>
        </div>
    );
};
