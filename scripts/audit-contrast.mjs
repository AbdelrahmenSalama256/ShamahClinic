/**
 * Contrast + layout audit over the rendered production build.
 *
 * Every colour is resolved to sRGB through a 1x1 canvas because Tailwind v4 emits
 * `oklch()`/`lab()`/`color-mix()` and those cannot be read as red/green/blue. The
 * two-canvas trick (fill over black, fill over white) also recovers the alpha a
 * browser refuses to serialise, which is what makes translucent headers, `bg-white/10`
 * pills and `text-white/70` leads measurable instead of guessable.
 *
 * For each visible piece of text, each control, each icon-only button, each input and
 * each badge it computes the WCAG ratio against the effective background (ancestor
 * colours composited in order, gradient stops sampled, photo-backed text flagged),
 * then repeats the pass for :hover, :focus-visible and disabled.
 *
 * Usage:
 *   node scripts/audit-contrast.mjs [origin] [--label=NAME] [--no-shots] [--fast]
 *
 * `--label` names the output pair (docs/contrast-report-<label>.md/.json) and the
 * screenshot prefix, so a baseline run and an after run never overwrite each other.
 * `--no-shots` skips the 112 screenshots; `--fast` scores only the default state.
 * Run it against `npm run build && npm run start`, not `npm run dev`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return process.argv.includes(`--${name}`) ? true : fallback;
};

const ORIGIN = process.argv[2] || "http://localhost:3100";
const LABEL = arg("label", "audit");
const SHOTS = !arg("no-shots", false);
const FAST = arg("fast", false);
const THRESHOLD_TEXT = 4.5;
const THRESHOLD_LARGE = 3;
// Narrow a run while debugging (`--route=/services --lang=ar --theme=dark`).
const ONLY_ROUTE = arg("route", "");
const ONLY_LANG = arg("lang", "");
const ONLY_THEME = arg("theme", "");

/** The routes the brief names, plus one live offer and one live post per language. */
const ROUTES = [
  "/",
  "/services",
  "/services/laser-hair-removal",
  "/services/botox-injections",
  "/offers",
  // One live detail page of each CMS type, in both languages: the slugs come from
  // `/api/v1/posts` and `/api/v1/offers` and are the same row in Arabic and English.
  "/blogs/plasma-zoom",
  "/offers/4-full-body-sessions-free-face-and-eyebrow-bleaching",
  "/blogs",
  "/about",
  "/branches",
  "/contact",
  "/faq",
  "/results",
  "/doctors",
  // The 404 is a surface like any other: it has to read in both themes.
  "/does-not-exist",
].filter((route) => !ONLY_ROUTE || route.includes(ONLY_ROUTE));

const SHOT_SIZES = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];
const OVERFLOW_WIDTHS = [360, 390, 768];
const shotsDir = path.join(process.cwd(), "docs", "screenshots");

/** Injected into the page: colour maths and the element walk. */
const PAGE_HELPERS = `
  const THRESHOLD_TEXT = ${THRESHOLD_TEXT};
  const THRESHOLD_LARGE = ${THRESHOLD_LARGE};
  // The page behind an open dialog is dimmed by its scrim and cannot be operated, so
  // the modal pass narrows the survey to the dialog subtree.
  let SCOPE = document.body;
  function setScope(selector) {
    SCOPE = (selector && document.querySelector(selector)) || document.body;
  }
  /**
   * globals.css puts "transition: all .3s ease-in-out !important" on every element, so a
   * reading taken right after focus or hover lands mid-interpolation: the focus ring
   * measures as the UA default (3px currentColor) instead of the shipped 2px token.
   * Jumping every running transition to its end state is exact, where a wait is either too
   * short to be correct or far too slow to repeat per element.
   */
  function settle() {
    for (const animation of document.getAnimations()) {
      try { animation.finish(); } catch (error) { /* infinite animation: left running */ }
    }
  }
  const __black = (() => { const c = document.createElement("canvas"); c.width = c.height = 1; return c.getContext("2d", { willReadFrequently: true }); })();
  const __white = (() => { const c = document.createElement("canvas"); c.width = c.height = 1; const g = c.getContext("2d", { willReadFrequently: true }); g.fillStyle = "#fff"; g.fillRect(0, 0, 1, 1); return g; })();

  /** css colour -> [r, g, b, a] in sRGB, whatever the browser serialises it as. */
  function resolve(value) {
    if (!value || value === "none" || value === "transparent") return null;
    __black.fillStyle = "#000"; __black.fillRect(0, 0, 1, 1);
    __black.fillStyle = value; __black.fillRect(0, 0, 1, 1);
    __white.fillStyle = "#fff"; __white.fillRect(0, 0, 1, 1);
    __white.fillStyle = value; __white.fillRect(0, 0, 1, 1);
    const pb = __black.getImageData(0, 0, 1, 1).data;
    const pw = __white.getImageData(0, 0, 1, 1).data;
    const alpha = Math.min(1, Math.max(0, 1 - (pw[0] - pb[0]) / 255));
    if (alpha <= 0) return null;
    return [pb[0] / alpha, pb[1] / alpha, pb[2] / alpha, alpha];
  }

  /** Every colour literal inside a background-image / -gradient string. */
  function stopsOf(image) {
    if (!image || image === "none") return [];
    const literals = image.match(/(rgba?\\([^)]*\\)|lab\\([^)]*\\)|oklab\\([^)]*\\)|lch\\([^)]*\\)|oklch\\([^)]*\\)|color\\([^)]*\\|#[0-9a-f]{3,8}\\b|\\b(white|black|transparent)\\b)/gi) || [];
    return literals.map(resolve).filter(Boolean);
  }

  const lum = (c) => c.slice(0, 3).map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);

  const blend = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);

  const ratio = (fg, bg) => {
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  };

  const rgbText = (c) => \`rgb(\${c.slice(0, 3).map(Math.round).join(" ")})\`;

  function selectorOf(element) {
    if (element.id) return \`#\${CSS.escape(element.id)}\`;
    const parts = [];
    for (let node = element; node && parts.length < 4; node = node.parentElement) {
      let name = node.tagName.toLowerCase();
      if (node.className && typeof node.className === "string") {
        const tokens = node.className.split(/\\s+/).filter((t) => t && !/^p-|m-|w-|h-|text-|bg-|gap-/.test(t));
        if (tokens.length) name += "." + tokens.slice(0, 2).map((t) => CSS.escape(t)).join(".");
      }
      const siblings = node.parentElement
        ? [...node.parentElement.children].filter((s) => s.tagName === node.tagName)
        : [];
      if (siblings.length > 1) name += \`:nth-of-type(\${siblings.indexOf(node) + 1})\`;
      parts.unshift(name);
    }
    return parts.join(" > ");
  }

  /**
   * Evaluate a linear-gradient() at one point. A scrim like "from dark 85% via 30% to
   * transparent" is one colour where the caption sits and another at the top of the
   * panel; scoring every stop calls white-on-cream a failure on a panel that is nearly
   * black where the text actually is.
   */
  function sampleLinear(image, layer, box) {
    const text = (image || "").trim();
    if (!/^linear-gradient\\(/i.test(text)) return null;
    const inner = text.slice(text.indexOf("(") + 1, text.lastIndexOf(")"));
    const parts = [];
    let depth = 0;
    let current = "";
    for (const ch of inner) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) { parts.push(current); current = ""; continue; }
      current += ch;
    }
    parts.push(current);
    // CSS: 0deg points up, 90deg right. Tailwind writes "to top"; the canvas writes degrees.
    let angle = 180;
    let direction = null;
    let interpolation = false;
    for (const part of parts) {
      const head = part.trim();
      if (/^-?[\\d.]+deg\\s*$/i.test(head)) { angle = parseFloat(head); direction = true; break; }
      if (/^to\\s+(left|right|top|bottom)(\\s+(left|right|top|bottom))?\\s*$/i.test(head)) {
        const words = head.toLowerCase().split(/\\s+/).slice(1);
        const map = { top: 0, right: 90, bottom: 180, left: 270 };
        angle = words.length === 1 ? map[words[0]] : (map[words[0]] + map[words[1]]) / 2;
        direction = true;
        break;
      }
      if (/^in\\s+[a-z0-9\\-\\s.]+$/i.test(head)) { interpolation = true; break; }
      break;
    }
    if (direction || interpolation) parts.shift();
    const stops = [];
    for (const part of parts) {
      const head = part.trim();
      if (!head) continue;
      const hit = head.match(/^(.*?)\\s+(-?[\\d.]+)%\\s*$/);
      const color = resolve(hit ? hit[1] : head);
      if (!color) continue;
      stops.push({ color, at: hit ? parseFloat(hit[2]) / 100 : null });
    }
    if (!stops.length) return null;
    for (let i = 0; i < stops.length; i += 1) {
      if (stops[i].at === null) stops[i].at = stops.length > 1 ? i / (stops.length - 1) : 0;
    }
    stops.sort((a, b) => a.at - b.at);
    const rad = (angle * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const length = Math.abs(layer.width * dx) + Math.abs(layer.height * dy) || 1;
    const cx = layer.left + layer.width / 2;
    const cy = layer.top + layer.height / 2;
    const px = (box.left + box.right) / 2;
    const py = (box.top + box.bottom) / 2;
    const t = Math.min(1, Math.max(0, 0.5 + ((px - cx) * dx + (py - cy) * dy) / length));
    let low = stops[0];
    let high = stops[stops.length - 1];
    for (let i = 0; i + 1 < stops.length; i += 1) {
      if (t >= stops[i].at && t <= stops[i + 1].at) { low = stops[i]; high = stops[i + 1]; break; }
    }
    const span = high.at - low.at;
    const k = span > 0 ? (t - low.at) / span : 0;
    const mixed = [0, 1, 2, 3].map((i) => low.color[i] + (high.color[i] - low.color[i]) * k);
    return mixed;
  }

  function shown(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1 && style.display !== "none" &&
      style.visibility !== "hidden" && Number(style.opacity) > 0.01;
  }

  const overlaps = (a, b) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  /** True for fixed page furniture (header, progress, floating actions) outside a dialog. */
  function isChrome(node) {
    for (let e = node; e && e !== document.body; e = e.parentElement) {
      if (e.matches && e.matches('[role="dialog"]')) return false;
      if (getComputedStyle(e).position === "fixed") return true;
    }
    return false;
  }

  /**
   * Everything painted behind the element, not just its ancestors. A hero label sits
   * inside \`div.z-10\` while the gold panel is its sibling \`div.absolute.inset-0\`, so an
   * ancestor-only walk reads the page cream and reports white-on-cream. Two sources are
   * unioned: native hit testing (correct for stacking contexts, blind to
   * pointer-events:none) and a DOM-order scan of the siblings that precede our branch.
   */
  function layersOf(element) {
    const box = element.getBoundingClientRect();
    const path = [];
    for (let node = element; node; node = node.parentElement) path.unshift(node);
    const nextOf = new Map();
    for (let i = 0; i < path.length - 1; i += 1) nextOf.set(path[i], path[i + 1]);
    const below = new Set();
    const above = new Set();

    const points = [
      [box.left + 1, box.top + 1], [box.right - 1, box.top + 1],
      [(box.left + box.right) / 2, (box.top + box.bottom) / 2],
      [box.left + 1, box.bottom - 1], [box.right - 1, box.bottom - 1],
    ].filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
    for (const [x, y] of points) {
      const hit = document.elementsFromPoint(x, y);
      const index = hit.indexOf(element);
      if (index === -1) continue;
      for (let i = index + 1; i < hit.length; i += 1) below.add(hit[i]);
      for (let i = 0; i < index; i += 1) if (hit[i] !== element) above.add(hit[i]);
    }

    for (const parent of nextOf.keys()) {
      for (const sibling of parent.children) {
        if (sibling === nextOf.get(parent)) break;
        const rect = sibling.getBoundingClientRect();
        if (!overlaps(rect, box)) continue;
        below.add(sibling);
        for (const inner of sibling.querySelectorAll("*")) {
          const style = getComputedStyle(inner);
          if (style.position !== "absolute" && style.position !== "fixed") continue;
          if (overlaps(inner.getBoundingClientRect(), box)) below.add(inner);
        }
      }
    }

    // A layer with a higher stacking order than its sibling on our path paints on top.
    const raised = [];
    outer: for (const node of below) {
      if (path.includes(node)) continue;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (Number(style.opacity) < 0.02) continue;
      const z = Number(style.zIndex);
      const peer = nextOf.get(node.parentElement);
      const peerZ = peer ? Number(getComputedStyle(peer).zIndex) : NaN;
      if (!Number.isNaN(z) && !Number.isNaN(peerZ) && z < peerZ) continue;
      // One of our own ancestors is a positioned layer lifted above the page, so
      // anything outside it (the dimmed page under a dialog, for instance) is
      // beneath us and cannot be part of our background.
      for (const ancestor of path) {
        if (ancestor === document.body || ancestor === document.documentElement) continue;
        const aStyle = getComputedStyle(ancestor);
        if (aStyle.position === "static") continue;
        if (Number(aStyle.zIndex) > 0 && !ancestor.contains(node)) continue outer;
      }
      raised.push(node);
    }
    // Paint order, not nesting depth: a photo wrapper sits *under* the <img> it
    // holds, and a scrim written after both sits *over* them. Sorting by depth put
    // the wrapper last and made its placeholder colour look like a finished backdrop.
    raised.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    return { raised, above: [...above].filter((n) => !path.includes(n)), path };
  }

  /** Colour literals from a node's own background, plus whether it is image-backed. */
  function paintsOf(node) {
    const style = getComputedStyle(node);
    const solid = resolve(style.backgroundColor);
    const image = style.backgroundImage || "";
    const photo = /url\\(/.test(image);
    const stops = photo ? [] : stopsOf(image);
    const decor = [];
    let pseudo = false;
    for (const part of ["::before", "::after"]) {
      const computed = getComputedStyle(node, part);
      if (computed.content === "none" || computed.content === "normal") continue;
      // A 2px underline bar is decoration, not a backdrop. Only let a pseudo paint
      // over the glyphs when it is in flow or tall enough to sit behind them,
      // otherwise a nav link gets scored against its own underline.
      if (computed.position === "absolute" || computed.position === "fixed") {
        const height = parseFloat(computed.height);
        if (Number.isFinite(height) && height < Math.max(6, parseFloat(computed.fontSize) * 0.6)) continue;
      }
      const color = resolve(computed.backgroundColor);
      const own = /url\\(/.test(computed.backgroundImage || "");
      const grad = own ? [] : stopsOf(computed.backgroundImage || "");
      if (color || grad.length || own) pseudo = true;
      if (color) decor.push(color);
      decor.push(...grad);
    }
    return { solid, stops, decor, photo, pseudo, opacity: Number(style.opacity) || 0 };
  }

  /**
   * The paint behind an element: ancestor background colours composited over the
   * page canvas, sibling layers and gradient stops kept as separate candidates (the
   * label may sit on any of them), and a photo flag when an image is part of the stack.
   */
  function behind(element, ancestorsOnly) {
    const { raised, above, path } = layersOf(element);
    const canvasColor = resolve(getComputedStyle(document.body).backgroundColor) ||
      resolve(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255, 1];
    let surface = canvasColor[3] >= 1 ? canvasColor : blend(canvasColor, [255, 255, 255, 1]);
    const candidates = [surface];
    let photo = false;
    let overlay = false;
    let opacity = 1;
    // Once image pixels are in the stack, every colour computed beneath them is a
    // guess: a photo's pixels are not in the cascade. The text is then reported for
    // manual review until something opaque covers the image, and scrim carries how
    // much tint actually sits between the glyphs and those pixels.
    let unreadable = false;
    let scrim = 0;
    const over = (a, b) => 1 - (1 - a) * (1 - b);

    /** How much of what is beneath this node it hides. */
    const coverage = (paintOf, node, sampled) => {
      if (paintOf.photo) return 1;
      let cover = paintOf.solid ? paintOf.solid[3] : 0;
      if (paintOf.stops.length) {
        const at = sampled &&
          sampleLinear(getComputedStyle(node).backgroundImage, node.getBoundingClientRect(), box);
        cover = over(cover, at ? at[3] : Math.max(...paintOf.stops.map((stop) => stop[3])));
      }
      for (const stop of paintOf.decor) cover = over(cover, stop[3]);
      return cover;
    };

    // An opaque layer hides everything beneath it, so it resets the candidate stack;
    // without that reset a green button on a cream page scores against the cream.
    const box = element.getBoundingClientRect();
    const paint = (node, sampled) => {
      const paintOf = paintsOf(node);
      opacity *= paintOf.opacity || 1;
      if (unreadable) {
        const cover = coverage(paintOf, node, sampled);
        scrim = over(scrim, cover);
        if (cover > 0) overlay = true;
        if (scrim < 0.999) return;
        unreadable = false;
      }
      if (paintOf.solid) {
        surface = blend(paintOf.solid, surface);
        if (paintOf.solid[3] >= 1) candidates.length = 0;
        candidates.push(surface);
      }
      if (paintOf.photo) {
        photo = true;
        unreadable = true;
        scrim = 0;
        candidates.length = 0;
        return;
      }
      if (paintOf.stops.length) {
        overlay = true;
        // A sibling overlay (a scrim, a tinted panel) is sampled where the text sits;
        // the element's own animated gradient keeps being scored at its worst stop,
        // because a gold button's label has to survive the whole sweep.
        const at = sampled && sampleLinear(getComputedStyle(node).backgroundImage, node.getBoundingClientRect(), box);
        if (at) {
          candidates.push(blend(at, surface));
          return;
        }
        const covered = paintOf.stops.every((stop) => stop[3] >= 1);
        if (covered) candidates.length = 0;
        for (const stop of paintOf.stops) candidates.push(blend(stop, surface));
        if (covered) surface = blend(paintOf.stops[0], surface);
        if (!candidates.length) candidates.push(surface);
      }
      // A ::before sheen (the gold sweep) sits on top of whatever it lights up.
      for (const stop of paintOf.decor) {
        overlay = true;
        for (const bg of [...candidates]) candidates.push(blend(stop, bg));
      }
    };

    for (const node of path.slice(0, -1)) paint(node);

    // An <img>/<video> box that overlaps the text is image-backed paint.
    // Whatever was in the stack beneath it is hidden by that image, so the
    // candidate list restarts from the layers painted on top of it (the scrim).
    for (const node of path.slice(0, -1)) {
      for (const media of node.querySelectorAll("img, video, canvas")) {
        if (media === element || media.contains(element)) continue;
        if (isChrome(media)) continue;
        if (!overlaps(media.getBoundingClientRect(), box)) continue;
        candidates.length = 0;
        photo = true;
        unreadable = true;
        scrim = 0;
      }
    }

    for (const node of raised) paint(node, true);
    paint(path.at(-1));

    for (const node of ancestorsOnly ? [] : above) {
      // Fixed chrome (sticky header, reading progress, floating actions) only covers
      // what is currently scrolled beneath it, which is a moment of scrolling, not a
      // contrast defect: the header's own opacity is checked separately. A dialog and
      // its backdrop are the real surfaces and stay counted.
      if (isChrome(node)) continue;
      if (unreadable) {
        const cover = coverage(paintsOf(node), node, false);
        scrim = over(scrim, cover);
        if (scrim < 0.999) continue;
        unreadable = false;
      }
      const paintOf = paintsOf(node);
      if (paintOf.photo) {
        photo = true;
        unreadable = true;
        scrim = 0;
        candidates.length = 0;
        continue;
      }
      if (paintOf.solid) {
        overlay = true;
        candidates.push(blend(paintOf.solid, surface));
      }
      for (const stop of paintOf.stops) candidates.push(blend(stop, surface));
    }

    const only = candidates.length ? candidates : [surface];
    return {
      candidates: [...new Set(only.map(rgbText))].map((t) => resolve(t)).slice(0, 24),
      photo,
      overlay,
      unreadable,
      scrim: Math.round(scrim * 100),
      opacity,
    };
  }

  function score(element, state) {
    const style = getComputedStyle(element);
    const { candidates, photo, overlay, unreadable, scrim, opacity } = behind(element);
    const ink = resolve(style.color);
    if (!ink) return null;
    ink[3] *= opacity;

    const iconOnly = !element.textContent.trim() && !!element.querySelector("svg");
    const painted = iconOnly
      ? resolve(getComputedStyle(element.querySelector("svg")).fill) ||
        resolve(getComputedStyle(element.querySelector("svg")).stroke) || ink
      : ink;

    const size = Number.parseFloat(style.fontSize) || 16;
    const weight = Number(style.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const label = element.textContent.trim().slice(0, 80) ||
      element.getAttribute("aria-label") || element.getAttribute("placeholder") ||
      element.getAttribute("title") || element.tagName.toLowerCase();

    const hasText = !!element.textContent.trim() || iconOnly;
    if (!hasText || !candidates.length) return null;

    let worst = Infinity;
    let worstBg = candidates[0];
    for (const bg of candidates) {
      const value = ratio(blend(painted, bg), bg);
      if (value < worst) { worst = value; worstBg = bg; }
    }

    const threshold = iconOnly || large || photo ? THRESHOLD_LARGE : THRESHOLD_TEXT;
    const invisible = !unreadable && candidates.some((bg) =>
      bg.slice(0, 3).every((c, i) => Math.abs(c - Math.round(blend(painted, bg)[i])) < 3));
    // WCAG exempts inactive components, so a disabled control is reported, not failed.
    const inactive = element.matches(":disabled,[aria-disabled=true],[inert]");

    let border = null;
    if (!unreadable &&
      element.matches("button,a,input,select,textarea,[role=button],.border,.rounded-full")) {
      for (const side of ["Top", "Right", "Bottom", "Left"]) {
        const width = Number.parseFloat(style[\`border\${side}Width\`]) || 0;
        if (width < 1 || style[\`border\${side}Style\`] === "none") continue;
        const color = resolve(style[\`border\${side}Color\`]);
        if (!color) continue;
        const bg = worstBg;
        const value = ratio(blend(color, bg), bg);
        if (value < THRESHOLD_LARGE) { border = { value: value.toFixed(2), color: rgbText(color) }; break; }
      }
    }

    let ring = null;
    if (state === "focus-visible" && !unreadable) {
      const width = Number.parseFloat(style.outlineWidth) || 0;
      const color = resolve(style.outlineColor);
      const offset = Number.parseFloat(style.outlineOffset) || 0;
      // A ring with an offset is painted on the surface *behind* the element, so it
      // is scored against that surface only. With no offset it straddles the element's
      // own edge and has to survive both. A UA default ring computes to width 0 and
      // cannot be verified from CSS at all.
      const parent = element.parentElement;
      const around = parent && shown(parent) ? behind(parent, true).candidates : [];
      const surfaces = offset > 0 && around.length ? around : [...candidates, ...around];
      let worstRing = Infinity;
      for (const bg of surfaces) worstRing = Math.min(worstRing, ratio(blend(color, bg), bg));
      const ok = style.outlineStyle !== "none" && style.outlineStyle !== "auto" &&
        width >= 2 && color && worstRing >= THRESHOLD_LARGE;
      if (!ok) ring = color ? rgbText(color) + " " + worstRing.toFixed(2) + ":1" : "none";
    }

    return {
      selector: selectorOf(element),
      label,
      fg: rgbText(painted),
      bg: rgbText(worstBg),
      ratio: unreadable ? "n/a" : worst.toFixed(2),
      threshold,
      state,
      photo,
      overlay,
      scrim,
      unreadable,
      invisible,
      inactive,
      border,
      ring,
      weight: style.fontWeight,
      size,
    };
  }

  function candidatesOf() {
    const set = new Set();
    const walker = document.createTreeWalker(SCOPE, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const parent = node.parentElement;
      if (!parent || !shown(parent)) continue;
      if (parent.closest("[aria-hidden=true],script,style,noscript,svg title")) continue;
      set.add(parent);
    }
    for (const el of SCOPE.querySelectorAll("button,a,input,select,textarea,[role=button],[role=checkbox],[tabindex]")) {
      if (shown(el)) set.add(el);
    }
    for (const el of SCOPE.querySelectorAll("svg")) {
      const owner = el.closest("button,a,[role=button]");
      if (owner && shown(owner) && !owner.textContent.trim()) set.add(owner);
    }
    return [...set];
  }

  function survey(state) {
    const out = [];
    for (const el of candidatesOf()) {
      const item = score(el, state);
      if (item) out.push(item);
    }
    return out;
  }
`;

const verdictOf = (item) => {
  // An inactive control is excluded from contrast by WCAG itself; it is still
  // listed so the count of what was looked at stays honest.
  if (item.inactive) return "EXEMPT: inactive component (WCAG 1.4.3 excludes it)";
  // Over a photograph the arithmetic cannot know what the pixels look like, so
  // the screenshot decides, not a worst-case candidate list. The number reported
  // is how much tint the design puts between the glyphs and those pixels.
  if (item.unreadable)
    return `REVIEW: text over a photo under a ${item.scrim}% scrim (needs the screenshot)`;
  if (item.photo) return "REVIEW: text over a photo with no detected overlay";
  if (item.invisible) return "FAIL: ink equals its background";
  if (Number(item.ratio) < item.threshold)
    return `FAIL: ${item.ratio}:1, needs ${item.threshold}:1`;
  if (item.border) return `FAIL: control border ${item.border.color} at ${item.border.value}:1`;
  if (item.ring) return `FAIL: focus ring ${item.ring} below 3:1 or missing`;
  return null;
};

const findings = [];
const layout = [];
const seen = new Set();

const record = (context, item, verdict) => {
  const key = `${context.route}|${context.theme}|${context.lang}|${item.selector}|${item.fg}|${item.bg}|${verdict}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({ ...context, ...item, verdict });
};

const slug = (route) => (route === "/" ? "home" : route.replace(/\//g, "-").replace(/^-/, ""));

await mkdir(shotsDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  for (const lang of ["ar", "en"].filter((v) => !ONLY_LANG || v === ONLY_LANG)) {
    for (const theme of ["light", "dark"].filter((v) => !ONLY_THEME || v === ONLY_THEME)) {
      const context = { theme, lang };
      const page = await (
        await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })
      ).newPage();
      await page.addInitScript((value) => localStorage.setItem("shamah_theme", value), theme);
      await page.addInitScript((value) => {
        const key = "shamah_lang";
        localStorage.setItem(key, value);
      }, lang);

      // One live offer and one live post per language, taken from their own lists.
      const routes = [...ROUTES];
      for (const section of ["offers", "blogs"]) {
        // --route filtering can leave the list out; then there is nothing to discover.
        if (!ROUTES.includes(`/${section}`)) continue;
        await page.goto(`${ORIGIN}/${lang}/${section}`, {
          waitUntil: "domcontentloaded",
        });
        const detail = await page
          .locator(`a[href*="${section}"]`)
          .evaluateAll(
            (links, section) => {
              // Arabic is the prefix-less locale, so its cards read `/blogs/slug`
              // while English writes `/en/blogs/slug`. Either is one detail link.
              const hit = links.find((l) => {
                const parts = new URL(l.href).pathname.split("/").filter(Boolean);
                const at = parts.lastIndexOf(section);
                return at >= 0 && parts[at + 1] && parts.length === at + 2;
              });
              return hit ? `/${new URL(hit.href).pathname.split("/").filter(Boolean).pop()}` : null;
            },
            section,
          )
          .catch(() => null);
        if (detail) routes.push(`/${section}${detail}`);
        else layout.push({ ...context, route: `/${section}/[detail]`, verdict: "REVIEW: the list links to no detail" });
      }

      for (const route of routes) {
        const url = `${ORIGIN}/${lang}${route === "/" ? "" : route}`;
        let status = 200;
        try {
          const response = await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          });
          status = response ? response.status() : 200;
        } catch (error) {
          layout.push({ ...context, route, verdict: `FAIL: load: ${error.message}` });
          continue;
        }
        // A route that quietly stopped resolving would otherwise be scored as
        // whatever page answers for it.
        if (status >= 400 && route !== "/does-not-exist") {
          layout.push({ ...context, route, verdict: `FAIL: HTTP ${status}` });
        }
        await page.evaluate(() => document.fonts.ready);
        // The theme map is applied on hydration and globals.css puts `transition:
        // all .3s` on every element, so surveying too early scores light ink over
        // dark paint mid-swap. Wait for the requested theme, then stop animating.
        await page
          .waitForFunction(
            (value) =>
              value === "dark"
                ? document.documentElement.dataset.theme === "dark"
                : !document.documentElement.dataset.theme,
            theme,
            { timeout: 10000 },
          )
          .catch(() => null);
        await page.addStyleTag({
          content: [
            // The gold gradient buttons animate forever, and `finish()` cannot settle an
            // infinite animation, so stop CSS animations here and let `settle()` below
            // finish the finite ones (transitions) deterministically.
            "html *,html *::before,html *::after{animation:none!important;scroll-behavior:auto!important}",
            // Scroll reveals keep below-the-fold text at opacity 0 until it is in view.
            // The audit walks the whole document, so score the revealed end state.
            ".reveal-armed{opacity:1!important}",
            "[class*=reveal-arm-]{transform:none!important}",
          ].join(""),
        });

        // Scroll the page so lazy content and scroll-armed reveals settle.
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < height; y += 900) {
          await page.evaluate((top) => window.scrollTo(0, top), y);
          await page.waitForTimeout(25);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(PAGE_HELPERS);
        await page.waitForTimeout(120);

        const score = async (where, scope) => {
          const open = `(() => { ${PAGE_HELPERS}; setScope(${JSON.stringify(scope || "")});`;
          const defaults = await page.evaluate(`${open} settle(); return survey("default"); })()`);
          for (const item of defaults) {
            const verdict = verdictOf(item);
            if (verdict) record({ ...context, route, surface: where }, item, verdict);
          }
          if (FAST) return;

          const states = await page.evaluate(`${open}
            const focused = [];
            for (const el of SCOPE.querySelectorAll("button,a,input,select,textarea,[role=button],[tabindex]")) {
              if (!shown(el) || el.matches(":disabled")) continue;
              el.focus();
              settle();
              // Synthetic focus does not always put the element in the keyboard state,
              // and a ring that is not painted cannot be measured — skip, never fail.
              if (el.matches(":focus-visible")) {
                const item = score(el, "focus-visible");
                if (item) focused.push(item);
              }
              el.blur();
            }
            const hovers = [...SCOPE.querySelectorAll("button,a,[role=button],input,select,textarea")]
              .filter(shown)
              .map((el) => {
                if (!el.dataset.auditId) el.dataset.auditId = String(Math.random()).slice(2, 10);
                const r = el.getBoundingClientRect();
                return { id: el.dataset.auditId, x: r.left + r.width / 2, y: r.top + r.height / 2, selector: selectorOf(el) };
              });
            return { focused, hovers };
          })()`);

          for (const item of states.focused) {
            const verdict = verdictOf(item);
            if (verdict) record({ ...context, route, surface: where }, item, verdict);
          }

          for (const control of states.hovers) {
            await page.mouse.move(control.x, control.y);
            await page.waitForTimeout(60);
            const item = await page.evaluate(
              `${open}
                const el = document.querySelector('[data-audit-id="${control.id}"]');
                if (!el || !el.matches(":hover")) return null;
                settle();
                return score(el, "hover");
              })()`,
            );
            if (!item) continue;
            const verdict = verdictOf(item);
            if (verdict) record({ ...context, route, surface: where }, item, verdict);
            await page.mouse.move(0, 0);
          }

          const disabled = await page.evaluate(`${open}
            return [...SCOPE.querySelectorAll("button,input,select,textarea")]
              .filter((el) => shown(el) && el.matches(":disabled"))
              .map((el) => score(el, "disabled")).filter(Boolean);
          })()`);
          for (const item of disabled) {
            const verdict = verdictOf(item);
            if (verdict) record({ ...context, route, surface: where }, item, verdict);
          }
        };

        await score("page");

        // The booking modal is the densest form surface on the site: chips, labels,
        // borders, errors and a date picker, all of it client-rendered on demand.
        if (route === "/services/laser-hair-removal") {
          const opened = await page.evaluate(() => {
            const button = [...document.querySelectorAll("button")].find((b) =>
              /احجزي|Book/i.test(b.textContent));
            if (button) button.click();
            return !!button;
          });
          if (opened) {
            await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).catch(() => null);
            // framer-motion drives the panel and its staggered children from JS, so the
            // injected `animation: none` cannot stop it. Scoring mid-enter reads the
            // still-transparent ink as invisible text.
            await page
              .waitForFunction(
                () => {
                  const dialog = document.querySelector('[role="dialog"]');
                  if (!dialog) return false;
                  return ![dialog, ...dialog.querySelectorAll("[style]")]
                    .map((el) => Number.parseFloat(getComputedStyle(el).opacity))
                    .some((value) => value < 0.99);
                },
                null,
                { timeout: 4000 },
              )
              .catch(() => null);
            await page.waitForTimeout(200);
            await score("booking modal", '[role="dialog"]');
            if (SHOTS) {
              await page.screenshot({
                path: path.join(shotsDir, `${LABEL}-booking-${lang}-${theme}-1440.png`),
              });
            }
            await page.keyboard.press("Escape");
            await page.waitForTimeout(200);
          } else {
            layout.push({ ...context, route, verdict: "REVIEW: no booking button to open the modal" });
          }
        }

        // A validation error is a state the algorithm cannot reach by itself. The
        // lead form is production-connected, so this pass is fenced twice: any
        // non-GET request from the page is aborted at the network layer, and a
        // capture-phase submit handler cancels the submit before it can serialize.
        // Only an untouched form is submitted, which can raise validation errors and
        // must never reach the clinic.
        if (route === "/contact" && !FAST) {
          let attempted = null;
          page.on("request", (request) => {
            if (request.method() !== "GET") {
              attempted = `${request.method()} ${request.url()}`;
              request.abort().catch(() => {});
            }
          });
          const submitted = await page.evaluate(() => {
            const form = document.querySelector("form");
            if (!form) return "no form on the page";
            const filled = [...form.querySelectorAll("input,textarea,select")]
              .some((field) => String(field.value ?? "").trim());
            if (filled) return "the form already carries input, leaving it alone";
            form.addEventListener("submit", (event) => {
              event.preventDefault();
              event.stopImmediatePropagation();
            }, { capture: true });
            form.querySelector("button[type=submit], input[type=submit]")?.click();
            return "clicked an empty submit";
          });
          if (submitted !== "clicked an empty submit") {
            layout.push({ ...context, route, verdict: `REVIEW: contact error pass skipped — ${submitted}` });
          }
          if (attempted) {
            layout.push({ ...context, route, verdict: `FAIL: the contact page attempted ${attempted}` });
          }
          await page.waitForTimeout(400);
          await score("contact form with errors");
          page.removeAllListeners("request");
        }

        for (const width of OVERFLOW_WIDTHS) {
          await page.setViewportSize({ width, height: 844 });
          await page.waitForTimeout(80);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          );
          if (overflow) layout.push({ ...context, route, width, verdict: "FAIL: horizontal overflow" });
        }

        if (SHOTS) {
          for (const size of SHOT_SIZES) {
            await page.setViewportSize(size);
            await page.goto(url, { waitUntil: "domcontentloaded" });
            await page.evaluate(() => document.fonts.ready);
            const tall = await page.evaluate(() => document.documentElement.scrollHeight);
            for (let y = 0; y < tall; y += 900) {
              await page.evaluate((top) => window.scrollTo(0, top), y);
              await page.waitForTimeout(20);
            }
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(350);
            await page.screenshot({
              path: path.join(
                shotsDir,
                `${LABEL}-${slug(route)}-${lang}-${theme}-${size.width}.png`,
              ),
              fullPage: true,
              animations: "disabled",
            });
          }
        }
        await page.setViewportSize({ width: 1440, height: 900 });
      }
      await page.context().close();
    }
  }
} finally {
  await browser.close();
}

const failures = findings.filter((f) => f.verdict.startsWith("FAIL"));
const reviews = findings.filter((f) => f.verdict.startsWith("REVIEW"));
const exemptions = findings.filter((f) => f.verdict.startsWith("EXEMPT"));

const cluster = (list) => {
  const by = new Map();
  for (const f of list) {
    const key = f.verdict.replace(/\b\d+(\.\d+)?/g, "N");
    by.set(key, (by.get(key) ?? 0) + 1);
  }
  return [...by].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} × ${k}`);
};

const cell = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const row = (f) =>
  `| ${cell(f.lang)}/${cell(f.theme)} | ${cell(f.route)} | ${cell(f.surface)} | \`${cell(f.selector)}\` | ${cell(f.label)} | ${f.fg} | ${cell(f.bg)} | ${f.ratio} | ${f.threshold} | ${cell(f.verdict)} (${f.state}) |`;

const markdown = [
  `# Contrast audit — ${LABEL}`,
  "",
  `Origin \`${ORIGIN}\`. ${findings.length} distinct findings over ar + en and light + dark:`,
  `**${failures.length} failures**, ${reviews.length} items kept for human review, ${exemptions.length} exempted. Screenshots: \`docs/screenshots/${LABEL}-*.png\`.`,
  "",
  failures.length ? `Failure classes: ${cluster(failures).join("; ")}` : "No contrast failures.",
  "",
  "Thresholds: 4.5:1 body text, 3:1 large text, icons, borders and focus rings. Colour is",
  "canvas-resolved sRGB, alpha composited over the real page background, gradient stops sampled",
  "individually, photo-backed text reported as REVIEW with the overlay it sits on.",
  "",
  "## Failures",
  "",
  "| Locale | Route | Surface | Selector | Text | FG | BG | Ratio | Needs | Verdict |",
  "|---|---|---|---|---|---|---|---:|---:|---|",
  ...failures.sort((a, b) => a.ratio - b.ratio).map(row),
  "",
  "## For human review (algorithm cannot decide)",
  "",
  "| Locale | Route | Surface | Selector | Text | FG | BG | Ratio | Verdict |",
  "|---|---|---|---|---|---|---|---:|---|",
  ...reviews.map((f) => row(f).replace(/ \| \d+ \((\w+)\) \|$/, " | ($1) |")),
  "",
  `## Exemptions (${exemptions.length})`,
  "",
  exemptions.length
    ? `${cluster(exemptions).join("; ")} — every one listed in the JSON with its selector.`
    : "Nothing was exempted.",
  "",
  "## Layout",
  "",
  layout.length
    ? `| Locale | Route | Width | Verdict |\n|---|---|---|---|\n${layout
        .map((l) => `| ${l.lang}/${l.theme} | ${cell(l.route)} | ${l.width ?? "—"} | ${cell(l.verdict)} |`)
        .join("\n")}`
    : "No horizontal overflow at 360, 390 or 768 px on any audited route.",
  "",
].join("\n");

const file = LABEL === "audit" ? "contrast-report" : `contrast-report-${LABEL}`;
await writeFile(path.join(process.cwd(), "docs", `${file}.md`), markdown);
await writeFile(
  path.join(process.cwd(), "docs", `${file}.json`),
  `${JSON.stringify({ origin: ORIGIN, label: LABEL, thresholds: { text: THRESHOLD_TEXT, large: THRESHOLD_LARGE }, findings, layout }, null, 2)}\n`,
);

console.log(`${LABEL}: ${failures.length} failures, ${reviews.length} review items, ${exemptions.length} exempt, ${layout.length} layout findings.`);
process.exitCode = failures.length || layout.some((l) => l.verdict.startsWith("FAIL")) ? 1 : 0;
