import { openUrl, useCookieBanner } from "@powerhousedao/connect";
import {
  Footer as DesignSystemFooter,
  FooterLink,
  Icon,
} from "@powerhousedao/design-system";
import { showPHModal } from "@powerhousedao/reactor-browser";
import { Trans } from "react-i18next";

export const Footer = () => {
  const [, setShowCookieBanner] = useCookieBanner();

  return (
    <DesignSystemFooter>
      <FooterLink
        onClick={() => {
          setShowCookieBanner(true);
        }}
      >
        <Trans i18nKey="footer.cookiePolicy" />
      </FooterLink>
      <FooterLink onClick={() => showPHModal({ type: "disclaimer" })}>
        <Trans i18nKey="footer.disclaimer" />
      </FooterLink>
      <FooterLink
        id="ph-logo-link"
        onClick={() => openUrl("https://www.powerhouse.inc/")}
      >
        <Trans
          i18nKey="footer.builtWith"
          components={{
            icon: (
              <Icon name="PowerhouseLogoSmall" size={16} className="mx-1" />
            ),
          }}
        />
      </FooterLink>
    </DesignSystemFooter>
  );
};
