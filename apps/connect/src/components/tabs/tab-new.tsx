import { useRef } from 'react';
import { useDropFile } from '../../hooks';
import { Tab, TabScopeFramework, useTabs, useTheme } from '../../store';
import Button from '../button';

export default () => {
    const ref = useRef(null);
    const theme = useTheme();
    const { selectedTab, updateTab } = useTabs();
    const { dropProps, isDropTarget } = useDropFile(ref);

    async function openFile() {
        try {
            const document = await window.electronAPI?.openFile();
            if (document) {
                updateTab(Tab.fromDocument(document));
            } else {
                throw new Error('File was not recognized.');
            }
        } catch (error) {
            console.error('Error opening file:', error); // TODO improve error handling
        }
    }

    return (
        <div>
            <div className="mb-10">
                <Button
                    className="bg-accent-1 text-text"
                    onClick={() =>
                        updateTab(
                            new TabScopeFramework(
                                undefined,
                                undefined,
                                selectedTab
                            )
                        )
                    }
                >
                    New Scope Framework
                </Button>
            </div>
            <h2 className="h2">Open existing file</h2>
            <div
                {...dropProps}
                ref={ref}
                className={`h-[240px] rounded-xl border-2 border-dashed
                ${
                    theme === 'dark'
                        ? 'border-neutral-1/20'
                        : 'border-accent-5/20'
                }
                ${
                    isDropTarget ? 'bg-light' : 'bg-bg'
                } my-6 flex max-w-4xl flex-col items-center justify-evenly py-5`}
            >
                <div className="h-9 select-none opacity-0"></div>
                <p className="text-accent-5">Drag file here</p>
                <Button className="button" onClick={openFile}>
                    Browse
                </Button>
            </div>
        </div>
    );
};
