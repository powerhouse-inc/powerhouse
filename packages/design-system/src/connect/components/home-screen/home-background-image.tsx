import HomeBgAvif from "#assets/home-bg.avif";
import HomeBgPng from "#assets/home-bg.png";

type HomeBackgroundImageProps = {
  src?: string;
};

export function HomeBackgroundImage({ src }: HomeBackgroundImageProps = {}) {
  return (
    <picture className="pointer-events-none absolute inset-8 z-0 size-[calc(100%-32px)] object-contain">
      {!src && <source srcSet={HomeBgAvif} type="image/avif" />}
      <img src={src ?? HomeBgPng} alt="background" className="object-contain" />
    </picture>
  );
}
