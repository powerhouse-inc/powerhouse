import { openUrl } from '#utils';
import {
    useCookieBanner,
    useModal,
    useSetCookieBanner,
} from '@powerhousedao/common';
import {
    Footer as DesignSystemFooter,
    FooterLink,
    Icon,
} from '@powerhousedao/design-system';
import { Trans } from 'react-i18next';

export const Footer = () => {
    const { show: showDisclaimerModal } = useModal('disclaimer');
    const showCookieBanner = useCookieBanner();
    const setShowCookieBanner = useSetCookieBanner();

    return (
        <DesignSystemFooter>
            <FooterLink
                onClick={() => {
                    setShowCookieBanner(true);
                }}
            >
                <Trans i18nKey="footer.cookiePolicy" />
            </FooterLink>
            <FooterLink onClick={() => showDisclaimerModal()}>
                <Trans i18nKey="footer.disclaimer" />
            </FooterLink>
            <FooterLink
                id="ph-logo-link"
                onClick={() => openUrl('https://www.powerhouse.inc/')}
            >
                <Trans
                    i18nKey="footer.builtWith"
                    components={{
                        icon: (
                            <Icon
                                name="PowerhouseLogoSmall"
                                size={16}
                                className="mx-1"
                            />
                        ),
                    }}
                />
            </FooterLink>
        </DesignSystemFooter>
    );
};
