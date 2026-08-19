import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputDir = resolve(root, "packages/tidyrun/dist");
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

await build({
  entryPoints: [resolve(root, "packages/cli/dist/main.js")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: resolve(outputDir, "cli.cjs"),
  sourcemap: true,
  legalComments: "none",
});

process.stdout.write(`TidyRun package bundle written to ${outputDir}\n`);
