import { iconNames, type IconName } from "#powerhouse";
import { Icon } from "#powerhouse";
import { useMemo } from "react";

interface UrlFaviconProps {
  url: string;
  platformIcons?: Record<string, React.ReactElement | IconName>;
}

const DEFAULT_ICON_NAME = "GlobeWww";

const UrlFavicon = ({ url, platformIcons }: UrlFaviconProps) => {
  const IconToUse: React.ReactElement | null = useMemo(() => {
    const defaultIcon = <Icon name={DEFAULT_ICON_NAME} size={18} />;
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname;
      const icon = platformIcons?.[hostname];
      if (!icon) return defaultIcon;

      if (typeof icon === "string") {
        // check beyond typescript check if the icon actually exists
        if (iconNames.includes(icon)) {
          return <Icon name={icon} size={18} />;
        } else {
          console.error(`Platform icon "${icon}" does not exist`);
          return defaultIcon;
        }
      }

      return icon;
    } catch {
      return defaultIcon;
    }
  }, [url, platformIcons]);

  if (Object.keys(platformIcons ?? {}).length === 0) return null;

  return (
    <div className="absolute left-2.5 top-0 flex h-full items-center justify-center text-gray-900">
      {IconToUse}
    </div>
  );
};

export default UrlFavicon;
