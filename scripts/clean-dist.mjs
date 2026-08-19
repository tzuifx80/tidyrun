import { rmSync } from "node:fs";
import { resolve, relative } from "node:path";

const target = resolve(process.cwd(), process.argv[2] ?? "dist");
const rel = relative(process.cwd(), target);
if (!rel || rel.startsWith("..") || rel.includes(":") || !/(^|[\\/])dist$/.test(rel)) throw new Error(`refusing to clean unexpected path: ${target}`);
rmSync(target, { recursive: true, force: true });
