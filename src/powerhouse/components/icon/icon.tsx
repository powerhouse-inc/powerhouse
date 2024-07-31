import { iconComponents } from '@/assets';
import { IconName } from '@/powerhouse';
import { ComponentPropsWithoutRef, CSSProperties } from 'react';

export type IconProps = ComponentPropsWithoutRef<'svg'> & {
    name: IconName;
    size?: CSSProperties['width'];
    color?: CSSProperties['color'];
};

function getDimensions(size?: IconProps['size']) {
    if (!size) return {};

    if (typeof size === 'number') {
        return {
            width: size + 'px',
            height: size + 'px',
        };
    }

    return {
        width: size,
        height: size,
    };
}

export function Icon({ name, size = 24, color, ...props }: IconProps) {
    const dimensions = getDimensions(size);
    const style = {
        color,
        ...dimensions,
    };
    const IconComponent = iconComponents[name];
    return <IconComponent {...props} style={style} />;
}
