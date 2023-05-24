import { ReactComponent as IconCollapse } from '@/assets/icons/collapse.svg';
import { ReactComponent as IconConnect } from '@/assets/icons/connect.svg';
import { ReactComponent as IconDraft } from '@/assets/icons/draft.svg';
import { ReactComponent as IconFile } from '@/assets/icons/file.svg';
import { ReactComponent as IconLogo } from '@/assets/icons/logo.svg';
import { ReactComponent as IconPlusCircle } from '@/assets/icons/plus-circle.svg';
import { ReactComponent as IconSettings } from '@/assets/icons/settings.svg';
import { ReactComponent as IconTemplate } from '@/assets/icons/template.svg';
import { useAtom, useAtomValue } from 'jotai';
import { NavLink, To, useNavigate } from 'react-router-dom';
import { sidebarCollapsedAtom, themeAtom } from '../store';
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
        >
            <div className="flex items-center">
                <IconLogo
                    onClick={collapsed ? toggleCollapse : () => navigate('/')}
                    className={'cursor-pointer'}
                />
                {collapsed || <IconConnect className="mx-2" />}
            </div>
            {collapsed || (
                <button onClick={toggleCollapse}>
                    <IconCollapse
                        className={
                            theme === 'dark'
                                ? 'fill-neutral-4'
                                : 'fill-neutral-3'
                        }
                    />
                </button>
            )}
        </div>
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

export default function () {
    const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);

    const theme = useAtomValue(themeAtom);

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

    return (
        <div
            className={`flex h-full flex-shrink-0 flex-col
                rounded-tr-xl bg-light px-4 pb-4
                ${collapsed ? 'w-[92px]' : 'w-[320px]'}
            `}
        >
            <div className={`flex-1 ${!collapsed && 'px-2'}`}>
                <SidebarHeader
                    collapsed={collapsed}
                    toggleCollapse={toggleCollapse}
                />
                <SidebarLink
                    to="/new"
                    title="New Document"
                    Icon={IconPlusCircle}
                    collapsed={collapsed}
                />
                <SidebarLink
                    to="/recent"
                    title="Recent Files"
                    Icon={IconFile}
                    collapsed={collapsed}
                />
                <SidebarLink
                    to="/drafts"
                    title="Drafts"
                    Icon={IconDraft}
                    collapsed={collapsed}
                />
                <SidebarLink
                    to="/templates"
                    title="Templates"
                    Icon={IconTemplate}
                    collapsed={collapsed}
                />
                {separator}
                <SidebarLink
                    to="/settings"
                    title="Settings"
                    Icon={IconSettings}
                    collapsed={collapsed}
                />
            </div>
            {collapsed ? separator : <div className="mb-4" />}
            <div className={`${!collapsed && 'px-2'}`}>
                <ThemeSelector />
            </div>
        </div>
    );
}
