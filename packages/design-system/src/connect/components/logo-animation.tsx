import { useEffect, useRef } from "react";
import { twMerge } from "tailwind-merge";

// Each brick: its id, drop delay (ms), fall delay (ms)
// Drop order: bottom → top. Fall order: bottom → top (same).
const SEQUENCE = [
  { id: "b3", dropDelay: 0, fallDelay: 0 },
  { id: "b4", dropDelay: 100, fallDelay: 80 },
  { id: "b7", dropDelay: 280, fallDelay: 240 },
  { id: "b5", dropDelay: 380, fallDelay: 320 },
  { id: "b8", dropDelay: 560, fallDelay: 480 },
  { id: "b6", dropDelay: 660, fallDelay: 560 },
  { id: "b9", dropDelay: 840, fallDelay: 720 },
  { id: "b2", dropDelay: 940, fallDelay: 800 },
  { id: "b10", dropDelay: 1120, fallDelay: 960 },
  { id: "b1", dropDelay: 1220, fallDelay: 1040 },
];

const ANIM_DUR = 460; // ms — both drop and fall duration
const HOLD = 800; // ms logo stays complete before falling
const LAST_DROP = 1220;
const LAST_FALL = 1040;
const LOOP_TOTAL = LAST_DROP + ANIM_DUR + HOLD + LAST_FALL + ANIM_DUR + 400;

const DROP_STYLE = `brickDrop ${ANIM_DUR}ms cubic-bezier(0.28, 1.08, 0.58, 1) forwards`;
const FALL_STYLE = `brickFall ${ANIM_DUR}ms cubic-bezier(0.28, 1.08, 0.58, 1) forwards`;

// SVG path data keyed by brick id
const PATHS: Record<string, string> = {
  b1: "M22.4861 7.36555C22.7622 7.36554 22.9861 7.14169 22.9861 6.86556L22.9863 -5.98095e-06C16.584 0.265497 10.8298 3.03817 6.679 7.36592L22.4861 7.36555Z",
  b2: "M15.9859 17.2641C15.9859 17.5403 15.762 17.7641 15.4859 17.7641L0.812049 17.7646C1.63552 14.6865 3.05564 11.8512 4.93889 9.39228L15.486 9.39189C15.7621 9.39188 15.986 9.61575 15.986 9.8919L15.9859 17.2641Z",
  b3: "M41.3219 40.5904C37.1727 44.9165 31.4185 47.6892 25.0147 47.9563L25.0148 41.0908C25.0148 40.8146 25.2387 40.5908 25.5148 40.5908L41.3219 40.5904Z",
  b4: "M22.9867 47.9547C16.5845 47.6895 10.8289 44.9156 6.67982 40.5896L22.4869 40.5892C22.763 40.5892 22.9869 40.8131 22.9869 41.0893L22.9867 47.9547Z",
  b5: "M16.7309 30.6891C16.7309 30.413 16.9548 30.1892 17.2309 30.1892L47.1889 30.1885C46.3654 33.2666 44.9469 36.1002 43.0621 38.5608L17.2308 38.5614C16.9546 38.5614 16.7307 38.3376 16.7307 38.0614L16.7309 30.6891Z",
  b6: "M36.1809 20.2901C36.1809 20.014 36.4048 19.7901 36.6809 19.7901L47.6394 19.7899C47.879 21.1488 48.0044 22.5479 48.0044 23.976C48.0043 25.404 47.8788 26.8032 47.6392 28.1621L36.6821 28.1608C36.406 28.1608 36.1822 27.937 36.1822 27.661L36.1809 23.721V20.2901Z",
  b7: "M15.0193 38.0631C15.0193 38.3392 14.7954 38.5631 14.5193 38.5631L4.93982 38.5633C3.05508 36.1028 1.63671 33.2692 0.813384 30.1912L14.5195 30.1908C14.7956 30.1908 15.0195 30.4147 15.0195 30.6908L15.0193 38.0631Z",
  b8: "M0.364936 19.791L33.613 19.7902C33.8892 19.7902 34.1131 20.014 34.1131 20.2902L34.1129 27.6625C34.1129 27.9386 33.889 28.1624 33.6129 28.1624L0.364728 28.1632C0.12514 26.8043 -0.00024171 25.4052 -0.000207992 23.9771C-0.000174275 22.549 0.125283 21.1499 0.364936 19.791Z",
  b9: "M18.0156 9.8918C18.0156 9.61566 18.2394 9.39181 18.5155 9.39181L43.0627 9.39138C44.9475 11.8519 46.3659 14.6855 47.1892 17.7635L18.5154 17.7641C18.2392 17.7641 18.0154 17.5402 18.0154 17.2641L18.0156 9.8918Z",
  b10: "M25.0158 -2.51999e-05C31.418 0.265176 37.1737 3.03916 41.3227 7.36511L25.5156 7.36547C25.2395 7.36547 25.0156 7.14161 25.0156 6.86546L25.0158 -2.51999e-05Z",
};

export function LogoAnimation({ size = 48, className = "" }) {
  const refsMap = useRef<Record<string, (SVGPathElement | null)[] | undefined>>(
    {},
  ); // id → array of path DOM nodes
  const timers = useRef<NodeJS.Timeout[]>([]);

  function getEls(id: string) {
    return refsMap.current[id] ?? [];
  }

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function schedule(fn: () => void, delay: number) {
    timers.current.push(setTimeout(fn, delay));
  }

  function resetAll() {
    Object.values(refsMap.current)
      .flat()
      .forEach((el) => {
        if (!el) return;
        el.style.animation = "none";
        el.style.opacity = "0";
      });
  }

  useEffect(() => {
    function runDrop(id: string, delay: number) {
      schedule(() => {
        getEls(id).forEach((el) => {
          if (el === null) return;
          el.style.animation = "none";
          el.style.opacity = "";
          el.style.animation = DROP_STYLE;
        });
      }, delay);
    }

    function runFall(id: string, delay: number) {
      schedule(() => {
        getEls(id).forEach((el) => {
          if (!el) return;
          el.style.animation = "none";
          el.style.animation = FALL_STYLE;
        });
      }, delay);
    }
    function startLoop() {
      clearTimers();
      resetAll();

      SEQUENCE.forEach(({ id, dropDelay }) => runDrop(id, dropDelay));

      const fallStart = LAST_DROP + ANIM_DUR + HOLD;
      SEQUENCE.forEach(({ id, fallDelay }) =>
        runFall(id, fallStart + fallDelay),
      );

      schedule(startLoop, LOOP_TOTAL);
    }
    startLoop();
    return () => clearTimers();
  }, []);

  // Register a path ref by brick id
  function refFor(id: string) {
    return (el: SVGPathElement | null) => {
      if (!refsMap.current[id]) refsMap.current[id] = [];
      if (el && !refsMap.current[id].includes(el)) {
        refsMap.current[id].push(el);
      }
    };
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="-1 -2 50 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={twMerge("text-foreground", className)}
      aria-label="Animated logo"
    >
      {SEQUENCE.map(({ id }) => (
        <path
          key={id}
          ref={refFor(id)}
          d={PATHS[id]}
          fill="currentColor"
          style={{ opacity: 0 }}
        />
      ))}
    </svg>
  );
}
