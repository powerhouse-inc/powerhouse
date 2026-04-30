import HomeBgAvif from "#assets/home-bg.avif";
import HomeBgPng from "#assets/home-bg.png";

type HomeBackgroundImageProps = {
  avifSrc?: string;
  pngSrc?: string;
};

export function HomeBackgroundImage({
  avifSrc,
  pngSrc,
}: HomeBackgroundImageProps = {}) {
  const avif = avifSrc ?? HomeBgAvif;
  const png = pngSrc ?? HomeBgPng;
  return (
    <picture className="pointer-events-none absolute inset-8 z-0 size-[calc(100%-32px)] object-contain">
      <source srcSet={avif} type="image/avif" />
      <img src={png} alt="background" className="object-contain" />
    </picture>
  );
}
