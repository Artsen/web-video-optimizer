import multer from "multer";
import { createApp } from "./app.js";
import { parseApiConfig } from "./config.js";
import { createProductionRuntime } from "./runtime/production-runtime.js";

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
  app.listen(config.port, config.host, () => {
    console.log(`Local Video Optimizer API listening on http://${config.host}:${config.port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
