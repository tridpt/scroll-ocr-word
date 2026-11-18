import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "vendor", "core"), { recursive: true });
await mkdir(join(dist, "vendor", "lang"), { recursive: true });

for (const name of ["manifest.json", "popup.html", "popup.css", "offscreen.html", "content.js"]) {
  await copyFile(join(root, "src", name), join(dist, name));
}

for (const name of ["lstm", "simd-lstm", "relaxedsimd-lstm"]) {
  for (const suffix of ["wasm.js", "wasm"]) {
    const file = `tesseract-core-${name}.${suffix}`;
    await copyFile(join(root, "node_modules", "tesseract.js-core", file), join(dist, "vendor", "core", file));
  }
}

for (const lang of ["vie", "eng"]) {
  await copyFile(
    join(root, "node_modules", "@tesseract.js-data", lang, "4.0.0_best_int", `${lang}.traineddata.gz`),
    join(dist, "vendor", "lang", `${lang}.traineddata.gz`),
  );
}

await copyFile(join(root, "node_modules", "tesseract.js", "dist", "worker.min.js"), join(dist, "vendor", "worker.min.js"));
await Promise.all(["background", "offscreen", "popup"].map((name) => build({
  entryPoints: [join(root, "src", `${name}.js`)],
  outfile: join(dist, `${name}.js`),
  bundle: true,
  platform: "browser",
  format: name === "background" ? "esm" : "iife",
  target: "chrome116",
  minify: true,
})));

console.log(`Extension ready: ${dist}`);
