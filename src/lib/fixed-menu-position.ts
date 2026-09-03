/** Keep fixed menus inside the visual viewport (no zoom / keyboard off-screen). */

export type MenuPos = { top: number; left: number };

const PAD = 12;

export function visualViewportBox() {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (vv) {
    return {
      left: vv.offsetLeft,
      top: vv.offsetTop,
      width: vv.width,
      height: vv.height,
    };
  }
  return {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function placeMenuBesideAnchor(
  anchor: DOMRect,
  menu: { width: number; height: number },
  gap = 8,
): MenuPos {
  const vp = visualViewportBox();
  const left = Math.min(
    Math.max(vp.left + PAD, anchor.right - menu.width),
    vp.left + vp.width - menu.width - PAD,
  );
  const spaceBelow = vp.top + vp.height - anchor.bottom - gap;
  const openUp = spaceBelow < menu.height && anchor.top - vp.top > spaceBelow;
  let top = openUp ? anchor.top - menu.height - gap : anchor.bottom + gap;
  const maxTop = vp.top + vp.height - menu.height - PAD;
  top = Math.min(Math.max(vp.top + PAD, top), Math.max(vp.top + PAD, maxTop));
  return { top, left: Math.max(vp.left + PAD, left) };
}
