# Benchmarking honestly

Benchmark fixtures compare the same deterministic command and repository under the same environment. They write JSON and Markdown reports to `benchmarks/`. A report records exit status, wall time, output bytes, and optional verification parity. It does not fabricate model token or dollar savings.

```bash
npm run benchmark                         # high-output diagnostic fixture
npx leanagent benchmark benchmarks/repeated-command.json
npm run benchmark:suite                   # checked-in Node, TypeScript, and Python fixtures
```

The high-output fixture is deliberately noisy: it repeats pass/progress lines
and includes actionable failures. The report compares the exact bytes emitted
by the command with the exact bytes delivered to the agent. The current checked-
in run observed 64,939 raw bytes versus 20,050 agent-visible bytes (69% derived
reduction) with equal exit status; this is a fixture result, not a universal
agent or token guarantee.

The latest checked-in suite report (`benchmarks/suite-report.json`) contains
three deterministic fixtures. That Windows run measured 86,159 raw bytes versus
22,455 delivered (74% derived reduction) and 17,742 ms versus 9,395 ms total
end-to-end (47% lower), with equal verification parity for all three fixtures.
The repeated-work fixture alone measured 17,527 ms versus 9,169 ms with one
verified cache hit and 165 ms observed local optimizer overhead. Short commands
can lose to startup overhead; the suite records that rather than claiming a
win.

For agent/model studies, record the provider's real usage metadata alongside the
report and keep baseline and LeanAgent runs identical (repository, commit, task,
model, configuration, and environment). A saving that changes the verification
result is a regression, not a success. Cache hits and output reductions are
observed/derived local metrics; token equivalents remain estimates unless the
provider reports tokens directly.
