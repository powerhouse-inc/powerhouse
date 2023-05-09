import { Document } from 'document-model-editors';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BudgetStatementEditor from './editor';

const App: React.FC = () => {
    const [page, setPage] = useState<'Document' | 'BudgetStatement'>(
        'Document'
    );
    return (
        <div>
            <div style={{ marginBottom: 20 }}>
                <button onClick={() => setPage('Document')}>
                    New Document Model
                </button>
                <button
                    onClick={() => setPage('BudgetStatement')}
                    style={{ marginLeft: 20 }}
                >
                    New Budget Statement
                </button>
            </div>
            <hr />
            {page === 'Document' ? (
                <Document.Editor />
            ) : (
                <BudgetStatementEditor />
            )}
        </div>
    );
};

createRoot(document.getElementById('app') as HTMLElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
