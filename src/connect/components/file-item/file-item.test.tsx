import { TreeItem } from '@/connect';
import { fireEvent, render, screen } from '@testing-library/react';
import { FileItem } from './file-item';

const item: TreeItem = {
    id: '1',
    label: 'Test Folder',
    availableOffline: false,
    path: '',
    type: 'FILE',
};

describe('FileItem Component', () => {
    it('should match snapshot', () => {
        const { asFragment } = render(
            <FileItem
                title="Legal Contract #1"
                subTitle="MakerDAO/Ecosystem Actors/Powerhouse/Chronicle Labs/Legal Contract 1"
                icon="profile"
                onClick={() => {}}
                onOptionsClick={() => {}}
                item={item}
            />,
        );

        expect(asFragment()).toMatchSnapshot();
    });

    it('should call onClick handler', () => {
        const onClick = vi.fn();

        render(
            <FileItem
                title="Legal Contract #1"
                subTitle="MakerDAO/Ecosystem Actors/Powerhouse/Chronicle Labs/Legal Contract 1"
                icon="profile"
                onClick={onClick}
                onOptionsClick={() => {}}
                item={item}
            />,
        );

        fireEvent.click(screen.getByText('Legal Contract #1'));
        expect(onClick).toBeCalledTimes(1);
    });
});
