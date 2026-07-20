import { runDevLauncher } from "./dev-processes.mjs";

const exitCode = await runDevLauncher();
process.exit(exitCode);
