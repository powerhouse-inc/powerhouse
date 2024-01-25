import { Icon } from '@/powerhouse';
import { Button, Heading } from 'react-aria-components';

export const Header = () => (
    <header className="mb-3 flex justify-between text-gray-600">
        <Button slot="previous">
            <Icon name="base-arrow-left" size={24} />
        </Button>
        <Heading />
        <Button slot="next">
            <Icon name="base-arrow-right" size={24} />
        </Button>
    </header>
);
