import IconDark from '@/assets/icons/dark.svg?react';
import IconLight from '@/assets/icons/light.svg?react';
import { useAtom, useAtomValue } from 'jotai';
import { Switch } from 'react-aria-components';
import { sidebarCollapsedAtom, themeAtom } from 'src/store';

function ThemeButton({
    Icon,
    name,
    isSelected,
    collapsed,
}: {
    Icon: React.FunctionComponent<React.SVGAttributes<SVGElement>>;
    name: string;
    isSelected: boolean;
    collapsed: boolean;
}) {
    if (collapsed && !isSelected) {
        return null;
    }

    return (
        <div
            className={`flex h-[44px] flex-1 items-center justify-center rounded-xl py-[10px]
        ${
            isSelected
                ? `text-current ${
                      !collapsed && (name === 'Dark' ? 'bg-bg' : 'bg-[#F3F5F7]')
                  }`
                : 'text-neutral-4'
        }
        `}
        >
            <Icon className="fill-current stroke-current" />
            {collapsed || <span className="ml-3">{name}</span>}
        </div>
    );
}

export default function ThemeSelector() {
    const collapsed = useAtomValue(sidebarCollapsedAtom);
    const [theme, setTheme] = useAtom(themeAtom);

    const isDark = theme === 'dark';

    return (
        <Switch
            onChange={isSelected => setTheme(isSelected ? 'dark' : 'light')}
            isSelected={theme === 'dark'}
            className={`flex cursor-pointer rounded-xl p-1
            ${
                collapsed
                    ? 'text-neutral-4'
                    : isDark
                      ? 'border-neutral-6/50 bg-neutral-6'
                      : 'border-neutral-3/50 bg-bg'
            }
            
            `}
        >
            <ThemeButton
                Icon={IconLight}
                name="Light"
                isSelected={!isDark}
                collapsed={collapsed}
            />
            <ThemeButton
                Icon={IconDark}
                name="Dark"
                isSelected={isDark}
                collapsed={collapsed}
            />
        </Switch>
    );
}
