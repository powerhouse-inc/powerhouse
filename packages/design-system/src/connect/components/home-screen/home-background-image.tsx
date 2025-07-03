import HomeBgAvif from "#assets/home-bg.avif";
import HomeBg from "#assets/home-bg.png";

export function HomeBackgroundImage() {
  return (
    <picture className="pointer-events-none absolute inset-8 z-0 size-[calc(100%-32px)] object-contain">
      <source srcSet={HomeBgAvif} type="image/avif" />
      <img src={HomeBg} alt="background" className="object-contain" />
    </picture>
  );
}
