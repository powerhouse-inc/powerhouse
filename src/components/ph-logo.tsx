import LogoMain from '@/assets/icons/BBP-logo-hover-light.svg?react';
import { openUrl } from 'src/utils/openUrl';

export const PHLogo = () => {
    return (
        <div className="fixed bottom-4 right-4">
            <a
                onClick={() => openUrl('https://www.powerhouse.inc/')}
                className="cursor-pointer opacity-45 transition-opacity duration-100 hover:opacity-100"
            >
                <LogoMain />
            </a>
        </div>
    );
};
