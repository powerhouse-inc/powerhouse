import { AnimatedLoader } from '@/connect';
import { DivProps } from '@/powerhouse';

type DefaultEditorLoaderProps = DivProps & {
    message?: string;
};

export function DefaultEditorLoader(props: DefaultEditorLoaderProps) {
    const { message = 'Loading editor', ...divProps } = props;
    return (
        <div className="grid h-full place-items-center" {...divProps}>
            <div className="-mt-20">
                <h3 className="mb-4 text-center text-xl">{message}</h3>
                <AnimatedLoader />
            </div>
        </div>
    );
}
