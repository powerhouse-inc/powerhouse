import { CalendarGridHeader, CalendarHeaderCell } from 'react-aria-components';

export const CalendarHeader = () => (
    <CalendarGridHeader>
        {day => (
            <CalendarHeaderCell className="size-[40px] items-center justify-center text-gray-600">
                {day}
            </CalendarHeaderCell>
        )}
    </CalendarGridHeader>
);
