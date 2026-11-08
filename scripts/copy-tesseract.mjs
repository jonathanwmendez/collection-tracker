// Copies the text-reading engine (tesseract.js) and its English data into public/tesseract, so the Scan
// page loads them from the app instead of a third-party CDN. Runs before dev and build.
import { cpSync, mkdirSync } from "node:fs";

const out = "public/tesseract";
mkdirSync(`${out}/core`, { recursive: true });
mkdirSync(`${out}/lang`, { recursive: true });
cpSync("node_modules/tesseract.js/dist/worker.min.js", `${out}/worker.min.js`);
for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]) {
  cpSync(`node_modules/tesseract.js-core/${f}`, `${out}/core/${f}`);
}
cpSync("node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", `${out}/lang/eng.traineddata.gz`);
console.log("Copied tesseract files to public/tesseract");
