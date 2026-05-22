import HomeBgAvif from "#assets/home-bg.avif";
import HomeBgPng from "#assets/home-bg.png";

export const HomeBackgroundImage = () => (
  <div className="pointer-events-none fixed top-0 z-0 size-full bg-white dark:bg-slate-900">
    <svg viewBox="0 0 1858 1256" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#clip0_4059_13373)">
        <ellipse
          cx="715.092"
          cy="627.885"
          rx="983.498"
          ry="480.668"
          transform="rotate(36.3289 715.092 627.885)"
          fill="url(#paint0_radial_4059_13373)"
          fillOpacity="0.3"
        />
        <ellipse
          cx="1344.68"
          cy="538.347"
          rx="759.956"
          ry="331.584"
          transform="rotate(36.3289 1344.68 538.347)"
          fill="url(#paint1_radial_4059_13373)"
          fillOpacity="0.2"
        />
      </g>
      <defs>
        <radialGradient
          id="paint0_radial_4059_13373"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(737.331 612.304) rotate(89.0086) scale(508.666 1077.08)"
        >
          <stop stopColor="white" stopOpacity="0" />
          <stop stopColor="#FF3FAC" />
          <stop offset="0.363434" stopColor="#9D25FC" stopOpacity="0.41" />
          <stop offset="0.783654" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id="paint1_radial_4059_13373"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(1344.68 538.347) rotate(90) scale(331.584 759.956)"
        >
          <stop stopColor="#0084FF" />
          <stop offset="0.802885" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <clipPath id="clip0_4059_13373">
          <rect width="1858" height="1256" fill="white" />
        </clipPath>
      </defs>
    </svg>
  </div>
);
