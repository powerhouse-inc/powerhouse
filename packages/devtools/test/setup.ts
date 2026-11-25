// happy-dom has no Web Animations API, which Base UI asks for.
if (typeof Element !== "undefined" && !("getAnimations" in Element.prototype)) {
  Object.assign(Element.prototype, { getAnimations: () => [] });
}
