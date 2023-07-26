import { ReactComponent as IconDraft } from '@/assets/icons/draft.svg';
import { ReactComponent as IconFile } from '@/assets/icons/file.svg';
import { ReactComponent as IconPlusCircle } from '@/assets/icons/plus-circle.svg';
import { ReactComponent as IconSettings } from '@/assets/icons/settings.svg';
import { useAtom, useAtomValue } from 'jotai';
import { NavLink, To, useNavigate } from 'react-router-dom';
import { useOpenFile } from 'src/hooks';
import {
    Tab,
    sidebarCollapsedAtom,
    themeAtom,
    useTabs,
    userAtom,
} from 'src/store';
import { saveFile } from 'src/utils/file';
import ThemeSelector from './theme-selector';

interface IProps {
    collapsed: boolean;
    toggleCollapse: () => void;
}

function SidebarHeader({ collapsed, toggleCollapse }: IProps) {
    const navigate = useNavigate();
    const theme = useAtomValue(themeAtom);
    return (
        <div
            className={`flex items-center px-[10px] py-10
            ${collapsed ? 'justify-center' : 'justify-between pr-[10px]'}
        `}
        ></div>
    );
}

export function SidebarLink({
    collapsed,
    to,
    Icon,
    title,
}: {
    collapsed: boolean;
    to: To;
    Icon: React.FunctionComponent<React.SVGAttributes<SVGElement>>;
    title: string;
}) {
    const theme = useAtomValue(themeAtom);

    return (
        <NavLink
            className={({
                isActive,
            }) => `flex w-full items-center rounded-lg fill-current p-3
        ${collapsed ? 'justify-center' : 'justify-start'}
        ${
            isActive
                ? `text-current ${
                      theme === 'dark' ? 'bg-selected' : 'bg-selected-light'
                  }`
                : 'text-neutral-4 hover:text-current'
        }`}
            to={to}
        >
            <div className="flex w-6 justify-center">
                <Icon className="fill-inherit" />
            </div>
            {collapsed || <span className="ml-5">{title}</span>}
        </NavLink>
    );
}

export function SidebarButton({
    collapsed,
    onClick,
    Icon,
    title,
}: {
    collapsed: boolean;
    onClick: () => void;
    Icon: React.FunctionComponent<React.SVGAttributes<SVGElement>>;
    title: string;
}) {
    const theme = useAtomValue(themeAtom);

    return (
        <button
            className={`
            flex w-full items-center rounded-lg fill-current p-3 text-neutral-4 hover:text-current
            ${collapsed ? 'justify-center' : 'justify-start'}
        `}
            onClick={onClick}
        >
            <div className="flex w-6 justify-center">
                <Icon className="fill-inherit" />
            </div>
            {collapsed || <span className="ml-5">{title}</span>}
        </button>
    );
}

export default function () {
    const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);

    const theme = useAtomValue(themeAtom);
    const user = useAtomValue(userAtom);
    const { addTab, selectedTab, getItem } = useTabs();

    function toggleCollapse() {
        setCollapsed(value => !value);
    }

    const separator = (
        <hr
            className={`my-4 ${
                theme === 'dark' ? 'border-neutral-6' : 'border-neutral-3'
            }`}
        />
    );

    const login = () => {
        window.electronAPI?.openURL('http://localhost:3000/');
    };

    const handleOpenFile = useOpenFile(async document => {
        addTab(await Tab.fromDocument(document));
    });

    async function handleSaveFile() {
        if (!selectedTab) {
            return;
        }
        const tab = getItem(selectedTab);
        if (tab.document) {
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: 'scope.zip',
            });
            saveFile(tab.document, fileHandle);
        }
    }

    return (
        <div
            className={`flex h-full flex-shrink-0
                flex-col bg-light px-4 pb-4 [overflow:overlay]
                ${collapsed ? 'w-[92px]' : 'w-[320px]'}
            `}
        >
            <div className={`flex-1 pt-10 ${!collapsed && 'px-2'}`}>
                <SidebarLink
                    to="/"
                    title="New Document"
                    Icon={IconPlusCircle}
                    collapsed={collapsed}
                />

                <SidebarButton
                    onClick={handleOpenFile}
                    title="Open"
                    Icon={IconFile}
                    collapsed={collapsed}
                />

                <SidebarButton
                    onClick={handleSaveFile}
                    title="Save"
                    Icon={IconDraft}
                    collapsed={collapsed}
                />
                {/* <SidebarLink
                    to="/templates"
                    title="Templates"
                    Icon={IconTemplate}
                    collapsed={collapsed}
                /> */}
                {separator}
                <SidebarLink
                    to="/settings"
                    title="Settings"
                    Icon={IconSettings}
                    collapsed={collapsed}
                />
            </div>
            {collapsed ? separator : <div className="h-4" />}
            <div className={`${!collapsed && 'px-2'} mt-4`}>
                <ThemeSelector />
            </div>
        </div>
    );
}
