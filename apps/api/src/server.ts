import multer from "multer";
import { createApp } from "./app.js";
import { parseApiConfig } from "./config.js";
import { createProductionRuntime } from "./runtime/production-runtime.js";
import { startServerLifecycle } from "./server-lifecycle.js";

async function main(): Promise<void> {
  const config = parseApiConfig(process.env, {
    cwd: process.cwd(),
    nodeExecPath: process.execPath
  });
  const runtime = createProductionRuntime(config);
  await runtime.initialize();

  const upload = multer({
    dest: config.uploadDir,
    limits: {
      fileSize: config.uploadFileSizeLimitBytes
    }
  });

  const app = createApp({ config, runtime, upload });
  await startServerLifecycle({ app, runtime, host: config.host, port: config.port });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
