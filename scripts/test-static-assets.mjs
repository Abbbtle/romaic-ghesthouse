/**
 * Lets tests import modules that import images and fonts, the way Next.js
 * allows: each file becomes a placeholder like a static image import.
 * Loaded with --import by `npm test`.
 */
import { registerHooks } from "node:module";

const staticAsset = /\.(avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i;

registerHooks({
  load(url, context, nextLoad) {
    if (!staticAsset.test(new URL(url).pathname)) return nextLoad(url, context);
    const placeholder = { src: new URL(url).pathname, width: 1, height: 1, blurDataURL: "" };
    return { format: "commonjs", source: `module.exports = ${JSON.stringify(placeholder)};`, shortCircuit: true };
  },
});
