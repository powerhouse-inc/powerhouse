import { ComponentPropsWithoutRef } from 'react';
import { NumericFormat } from 'react-number-format';

type Props = Omit<
    ComponentPropsWithoutRef<typeof NumericFormat>,
    'displayType'
> & {
    currency?: 'USD';
};

export function FormattedNumber(props: Props) {
    const {
        value,
        currency,
        decimalScale = 2,
        thousandSeparator = ',',
        fixedDecimalScale = true,
    } = props;

    const prefix = currency === 'USD' ? '$' : undefined;

    return (
        <NumericFormat
            displayType="text"
            value={value}
            prefix={prefix}
            decimalScale={decimalScale}
            thousandSeparator={thousandSeparator}
            fixedDecimalScale={fixedDecimalScale}
        />
    );
}
