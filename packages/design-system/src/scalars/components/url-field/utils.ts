import { IconName } from "@/assets/icon-components/types";

export function getIconName(url: string): IconName {
  const defaultIcon = "GlobeWww";

  if (!url.trim()) return defaultIcon;

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    switch (hostname) {
      case "forum.sky.money":
        return "Forum";
      case "discord.com":
      case "discord.gg":
        return "Discord";
      case "twitter.com":
      case "x.com":
        return "XTwitter";
      case "github.com":
        return "Github";
      case "linkedin.com":
        return "Linkedin";
      case "youtube.com":
      case "youtu.be":
        return "Youtube";
      default:
        return defaultIcon;
    }
  } catch {
    // If the URL is invalid, return the default icon
    return defaultIcon;
  }
}
