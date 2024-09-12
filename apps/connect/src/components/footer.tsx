import {
    Footer as DesignSystemFooter,
    FooterLink,
    Icon,
} from '@powerhousedao/design-system';
import { Trans } from 'react-i18next';
import { openUrl } from 'src/utils/openUrl';

export const Footer = () => {
    return (
        <DesignSystemFooter className="fixed bottom-8 right-8">
            <FooterLink
                onClick={() =>
                    openUrl('https://expenses.makerdao.network/cookies-policy')
                }
            >
                <Trans i18nKey="footer.cookiePolicy" />
            </FooterLink>
            <FooterLink
                onClick={() => openUrl('https://docs.sky.money/legal-terms')}
            >
                <Trans i18nKey="footer.termsOfUse" />
            </FooterLink>
            <FooterLink
                onClick={() =>
                    openUrl('https://expenses.makerdao.network/disclaimer')
                }
            >
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
