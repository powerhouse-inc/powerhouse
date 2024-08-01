import { iconComponents } from '@/assets';
import { Color, getDimensions, IconName, Size } from '@/powerhouse';
import { ComponentPropsWithoutRef } from 'react';

export type IconProps = ComponentPropsWithoutRef<'svg'> & {
    name: IconName;
    size?: Size;
    color?: Color;
};

export function Icon({ name, size = 24, color, style, ...props }: IconProps) {
    const dimensions = getDimensions(size);
    const _style = {
        color,
        ...dimensions,
        style,
    };
    const IconComponent = iconComponents[name];
    return <IconComponent {...props} style={_style} />;
}
