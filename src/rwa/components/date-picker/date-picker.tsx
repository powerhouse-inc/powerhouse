import { Icon } from '@/powerhouse';
import { CalendarDate } from '@internationalized/date';
import React from 'react';
import {
    Button,
    Calendar,
    CalendarGrid,
    DateInput,
    DatePicker,
    DatePickerProps,
    DateSegment,
    Dialog,
    Group,
    Label,
    Popover,
} from 'react-aria-components';
import { CalendarBody } from './calendar-body';
import { CalendarHeader } from './calendar-header';
import { Header } from './header';

export interface RWADatePickerProps extends DatePickerProps<CalendarDate> {
    label?: string;
}

export const RWADatePicker: React.FC<RWADatePickerProps> = props => {
    const { label, ...datePickerProps } = props;

    return (
        <DatePicker {...datePickerProps}>
            {label && (
                <Label className="mb-2 text-xs text-gray-600">{label}</Label>
            )}
            <Group className="flex h-[42px] items-center rounded-xl bg-gray-100 px-3">
                <div className="flex">
                    <Icon
                        name="calendar"
                        size={24}
                        className="mr-2 text-gray-600"
                    />
                    <DateInput className="flex items-center text-xs text-gray-900 outline-none">
                        {segment => (
                            <DateSegment
                                segment={segment}
                                className="outline-none"
                            />
                        )}
                    </DateInput>
                </div>
                <Button className="flex h-full flex-1 items-center justify-end outline-none">
                    <Icon name="caret-down" size={16} />
                </Button>
            </Group>
            <Popover>
                <Dialog>
                    <Calendar className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm font-semibold text-gray-900">
                        {calendarRenderProps => (
                            <>
                                <Header />
                                <CalendarGrid className="text-center">
                                    <CalendarHeader />
                                    <CalendarBody
                                        calendarRenderProps={
                                            calendarRenderProps
                                        }
                                    />
                                </CalendarGrid>
                            </>
                        )}
                    </Calendar>
                </Dialog>
            </Popover>
        </DatePicker>
    );
};
