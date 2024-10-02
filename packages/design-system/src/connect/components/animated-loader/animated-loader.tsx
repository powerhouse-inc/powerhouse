import ConnectLoaderImg from '@/assets/connect-loader.png';
import { getDimensions, Size } from '@/powerhouse';
import { ComponentPropsWithoutRef, CSSProperties } from 'react';

type Props = Omit<ComponentPropsWithoutRef<'img'>, 'src'> & {
    readonly size?: Size;
};
export function AnimatedLoader(props: Props) {
    const { style, size = 100, alt = 'Loading...', ...delegatedProps } = props;

    const dimensions = getDimensions(size);

    const _style: CSSProperties = {
        objectFit: 'contain',
        ...dimensions,
        ...style,
    };

    return (
        <img
            {...delegatedProps}
            alt={alt}
            src={ConnectLoaderImg}
            style={_style}
        />
    );
}
