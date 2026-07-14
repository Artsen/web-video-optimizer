import { createApp } from "./app.js";
import { isLoopbackHost, parseApiConfig } from "./config.js";
import { createProductionRuntime } from "./runtime/production-runtime.js";
import { startServerLifecycle } from "./server-lifecycle.js";
import { createUploadMiddleware } from "./uploads/create-upload-middleware.js";

async function main(): Promise<void> {
  const config = parseApiConfig(process.env, {
    cwd: process.cwd(),
    nodeExecPath: process.execPath
  });
  if (config.allowLanAccess && !isLoopbackHost(config.host)) {
    console.warn("LAN access is enabled. The API is exposed beyond loopback on a trusted network.");
  }
  const runtime = createProductionRuntime(config);
  await runtime.initialize();

  const app = createApp({ config, runtime, upload: createUploadMiddleware(config) });
  await startServerLifecycle({ app, runtime, host: config.host, port: config.port });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
