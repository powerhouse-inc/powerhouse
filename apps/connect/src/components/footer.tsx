import { openUrl, useCookieBanner } from "@powerhousedao/connect";
import {
  Footer as DesignSystemFooter,
  FooterLink,
  Icon,
} from "@powerhousedao/design-system";
import { Trans } from "react-i18next";
import { useModal } from "@powerhousedao/connect";

export const Footer = () => {
  const { showModal } = useModal();
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
      <FooterLink onClick={() => showModal("disclaimerModal", {})}>
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
