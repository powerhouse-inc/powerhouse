import { AnimatedLoader } from '../animated-loader';

export function DefaultEditorLoader() {
    return (
        <div className="grid h-full place-items-center">
            <div className="-mt-20">
                <h3 className="mb-4 text-center text-xl">Loading editor</h3>
                <AnimatedLoader />
            </div>
        </div>
    );
}
