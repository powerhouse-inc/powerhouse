import React from 'react';
import {
    CalendarCell,
    CalendarGridBody,
    CalendarRenderProps,
} from 'react-aria-components';
import { twMerge } from 'tailwind-merge';

interface CalendarBodyProps {
    calendarRenderProps?: CalendarRenderProps;
}

export const CalendarBody: React.FC<CalendarBodyProps> = props => {
    const { calendarRenderProps } = props;
    const value = calendarRenderProps?.state.value;

    return (
        <CalendarGridBody>
            {date => {
                const isSelectedDay =
                    date.day === value?.day &&
                    date.month === value.month &&
                    date.year === value.year &&
                    date.era === value.era;

                const display =
                    date.month ===
                    calendarRenderProps?.state.visibleRange.start.month;

                return (
                    <CalendarCell
                        date={date}
                        className={twMerge(
                            'flex size-[40px] items-center justify-center rounded-md outline-none',
                            !display && 'cursor-default text-gray-500',
                            isSelectedDay && 'bg-gray-200',
                        )}
                    />
                );
            }}
        </CalendarGridBody>
    );
};
