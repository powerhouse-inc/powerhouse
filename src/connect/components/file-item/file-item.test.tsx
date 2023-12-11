import { fireEvent, render, screen } from '@testing-library/react';
import { FileItem } from './file-item';

describe('FileItem Component', () => {
    it('should match snapshot', () => {
        const { asFragment } = render(
            <FileItem
                title="Legal Contract #1"
                subTitle="MakerDAO/Ecosystem Actors/Powerhouse/Chronicle Labs/Legal Contract 1"
                icon="profile"
                onClick={() => {}}
                onOptionsClick={() => {}}
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
            />,
        );

        fireEvent.click(screen.getByText('Legal Contract #1'));
        expect(onClick).toBeCalledTimes(1);
    });
});
