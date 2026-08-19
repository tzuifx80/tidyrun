// Deterministic high-output fixture used to prove that agent-visible output,
// rather than command execution time alone, is reduced. It intentionally emits
// realistic diagnostics interleaved with progress and warning chatter.
const failures = Number(process.env.TIDYRUN_FIXTURE_FAILURES ?? 18);
const lines = [];
for (let i = 0; i < 1200; i += 1) {
  lines.push(`PASS [${i + 1}/1200] unrelated fixture case ${i + 1}`);
  if (i % 7 === 0) lines.push(`warning: dependency metadata for fixture-${i} is stale`);
}
for (let i = 0; i < failures; i += 1) {
  lines.push(`FAIL src/auth/token.test.ts > refresh token rejects expired token ${i + 1}`);
  lines.push(`AssertionError: expected status 401, received 200 (case ${i + 1})`);
  lines.push(`    at src/auth/token.test.ts:${20 + i}:11`);
  lines.push(`    at node_modules/vitest/dist/runner.js:${100 + i}:4`);
}
lines.push(`${1200 - failures} passed, ${failures} failed, 171 warnings`);
process.stdout.write(`${lines.join("\n")}\n`);
process.exitCode = failures ? 1 : 0;
