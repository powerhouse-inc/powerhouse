import { Select } from '../../select';
import { Scope as TScope } from '../types';

type Props = {
    value: TScope;
    onChange: (value: TScope) => void;
};
export function Scope(props: Props) {
    const { value, onChange } = props;
    const items = [
        { displayValue: 'Global scope', value: 'global' },
        { displayValue: 'Local scope', value: 'local' },
    ] as const;

    return (
        <Select
            id="scope select"
            value={value}
            items={items}
            onChange={onChange}
            containerClassName="bg-slate-50 text-gray-500 rounded-lg w-fit text-xs"
            menuClassName="min-w-0 text-gray-500"
            itemClassName="py-2 text-gray-500 grid grid-cols-[auto,auto] gap-1"
            absolutePositionMenu
        />
    );
}
