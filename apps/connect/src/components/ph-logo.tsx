import LogoMain from "#assets/icons/BBP-logo-hover-light.svg?react";
import { openUrl } from "@powerhousedao/connect";

export const PHLogo = () => {
  return (
    <div className="fixed bottom-8 right-8" id="ph-logo-link">
      <a
        onClick={() => openUrl("https://www.powerhouse.inc/")}
        className="cursor-pointer opacity-45 transition-opacity duration-100 hover:opacity-100"
      >
        <LogoMain />
      </a>
    </div>
  );
};
