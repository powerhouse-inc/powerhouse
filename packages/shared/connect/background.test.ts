import { describe, expect, it } from "vitest";
import {
  imageVariants,
  layerDeclarations,
  layerStyle,
  layerStyleText,
  mapBackgroundImages,
  normalizeBackground,
  validateBackground,
} from "./background.js";

describe("normalizeBackground", () => {
  it("makes one bottom-right layer of a single image and keeps layers", () => {
    expect(normalizeBackground("./bg.webp")).toEqual({
      layers: [{ src: "./bg.webp", position: { bottom: 0, right: 0 } }],
    });
    expect(normalizeBackground(null)).toBeNull();
    expect(normalizeBackground("")).toBeNull();
    const layered = { color: "#fff", layers: [{ src: "./a.svg" }] };
    expect(normalizeBackground(layered)).toEqual(layered);
  });
});

describe("layerDeclarations", () => {
  it("pins the edges that are set and centres the axes that are not", () => {
    expect(layerDeclarations({ src: "a.svg" })).toMatchObject({
      position: "absolute",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
    });
    expect(
      layerDeclarations({ src: "a.svg", position: { top: 32 } }),
    ).toMatchObject({
      top: "32px",
      left: "50%",
      transform: "translate(-50%, 0)",
    });
    const corner = layerDeclarations({
      src: "a.svg",
      position: { bottom: 0, right: "4%" },
    });
    expect(corner).toMatchObject({ bottom: "0px", right: "4%" });
    expect(corner.transform).toBeUndefined();
    expect(corner.left).toBeUndefined();
  });

  it("sizes in px or CSS lengths, with min and max bounds and opacity", () => {
    expect(
      layerDeclarations({
        src: "a.svg",
        width: "min(55%, 880px)",
        height: 80,
        minWidth: 200,
        minHeight: "10vh",
        maxWidth: 1280,
        maxHeight: "720px",
        opacity: 0.9,
      }),
    ).toMatchObject({
      width: "min(55%, 880px)",
      height: "80px",
      "min-width": "200px",
      "min-height": "10vh",
      "max-width": "1280px",
      "max-height": "720px",
      opacity: "0.9",
      "object-fit": "contain",
    });
  });

  it("feathers the named edges into the page with a mask", () => {
    const one = layerDeclarations({ src: "a.svg", fade: { top: 160 } });
    expect(one["mask-image"]).toBe(
      "linear-gradient(to bottom, transparent, #000 160px)",
    );
    expect(one["mask-composite"]).toBeUndefined();
    const two = layerDeclarations({
      src: "a.svg",
      fade: { top: 160, left: "20%" },
    });
    expect(two["mask-image"]).toBe(
      "linear-gradient(to bottom, transparent, #000 160px), linear-gradient(to right, transparent, #000 20%)",
    );
    expect(two["mask-composite"]).toBe("intersect");
  });

  it("renders as style text and as React style keys", () => {
    const layer = {
      src: "a.svg",
      position: { bottom: 0, right: 0 },
      width: 320,
    };
    expect(layerStyleText(layer)).toBe(
      "position: absolute; pointer-events: none; object-fit: contain; right: 0px; bottom: 0px; width: 320px",
    );
    expect(layerStyle(layer)).toEqual({
      position: "absolute",
      pointerEvents: "none",
      objectFit: "contain",
      right: "0px",
      bottom: "0px",
      width: "320px",
    });
  });
});

describe("validateBackground", () => {
  it("rejects both edges of an axis, a missing image and an opacity out of range", () => {
    expect(validateBackground("./bg.webp")).toEqual([]);
    expect(
      validateBackground(
        {
          layers: [
            { src: "a.svg", position: { top: 0, bottom: 0 } },
            { src: { light: "" }, opacity: 2 },
            { src: "b.svg", position: { left: 1, right: 1 }, opacity: 0 },
          ],
        },
        "homeBackground",
      ),
    ).toEqual([
      "homeBackground.layers[0].position: set top or bottom, not both",
      "homeBackground.layers[1].src: an image is required",
      "homeBackground.layers[1].opacity: must be between 0 and 1",
      "homeBackground.layers[2].position: set left or right, not both",
    ]);
  });
});

describe("mapBackgroundImages", () => {
  it("maps both scheme variants, drops a layer without an image, and keeps the rest", () => {
    const mapped = mapBackgroundImages(
      {
        color: "#fff",
        layers: [
          { src: { light: "l.svg", dark: "d.svg" }, width: 10 },
          { src: { light: "l2.svg", dark: "missing.svg" } },
          { src: "missing.svg" },
        ],
      },
      (ref) => (ref.startsWith("missing") ? undefined : `data:${ref}`),
    );
    expect(mapped).toEqual({
      color: "#fff",
      layers: [
        { src: { light: "data:l.svg", dark: "data:d.svg" }, width: 10 },
        { src: "data:l2.svg" },
      ],
    });
    expect(imageVariants({ light: "a", dark: "a" })).toEqual({ light: "a" });
  });
});
