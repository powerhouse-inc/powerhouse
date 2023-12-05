import { IconName } from '@/powerhouse';
import { CSSProperties, ComponentPropsWithoutRef } from 'react';

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

/**
 * A flexible component for displaying icons.
 *
 * Uses the `icons.svg` sprite sheet.
 *
 * @param name is the id of the icon in the sprite sheet.
 * @param size is the width and height of the icon, which defaults to 24px
 * @param color is the color of the icon, which defaults to `currentColor`
 *
 * @example
 * // in most cases, it should be sufficient to use the `Icon` component with just the `name` prop.
 * // this will render the icon with the default size (24px) and use the current color of the text for the fill/stroke.
 * ```tsx
 * <Icon name="arrow-left" />
 * ```
 *
 * @example
 * // if you want to control the icon's size or color in the location where you _declare_ the icon, you can use the `size` and `color` props.
 * ```tsx
 * <Icon name="arrow-left" size={16} color="#7C878E" />
 * ```
 *
 * @example
 * // since we also pass on the `className` attribute, you can also use the `Icon` component with Tailwind CSS classes.
 * ```tsx
 * <Icon name="arrow-left" className="text-slate-800 w-16 h-16" />
 * ```
 *
 * @example
 * // if you need to override the color of an icon where you _use_ the icon, for example if the icon is passed as a prop to another component, you can wrap the icon in another element and set the text color on the wrapper.
 * ```tsx
 * <span className="text-slate-800">
 *    {icon}
 * </span>
 * ```
 *
 * @example
 * // while it should be very rare that you need to override the dimensions of an icon where you _use_ the icon, you can wrap the icon in another element and use tailwind's child selector syntax ([&>element]:) to target the inner <svg> element.
 * ```tsx
 * <span className="[&>svg]:w-16 [&>svg]:h-16">
 *   {icon}
 * </span>
 * ```
 */
export function Icon({ name, size = 24, color, ...props }: IconProps) {
    const dimensions = getDimensions(size);
    const style = {
        color,
        ...dimensions,
    };
    return (
        <svg {...props} style={style}>
            <use href={`/icons.svg#${name}`} />
        </svg>
    );
}
