import { runEnrichEval } from "./enrichEval.js";

const SUITES: Record<string, () => Promise<boolean>> = {
  enrich: runEnrichEval,
};

async function main() {
  const suiteArg = process.argv.find((a) => a.startsWith("--suite="))?.split("=")[1];
  const suiteNames = suiteArg ? [suiteArg] : Object.keys(SUITES);

  let allOk = true;
  for (const name of suiteNames) {
    const run = SUITES[name];
    if (!run) {
      console.error(`Unknown suite "${name}". Known suites: ${Object.keys(SUITES).join(", ")}`);
      process.exit(1);
    }
    console.log(`\n=== ${name} ===`);
    const ok = await run();
    allOk = allOk && ok;
  }

  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
