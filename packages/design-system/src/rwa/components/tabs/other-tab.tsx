import { OtherTableComponents } from '@/rwa/types';

type Props = {
    readonly otherTableComponents: OtherTableComponents;
};

export function OtherTab(props: Props) {
    const { otherTableComponents } = props;
    return (
        <div>
            {otherTableComponents.map(
                ({ Component, value, label, description }) => (
                    <div key={value}>
                        <h2 className="mb-2 text-lg font-bold">{label}</h2>
                        <p className="mb-4 text-xs text-gray-600">
                            {description}
                        </p>
                        <Component />
                    </div>
                ),
            )}
        </div>
    );
}
