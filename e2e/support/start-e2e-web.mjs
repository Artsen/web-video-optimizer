import process from "node:process";
import { preview } from "vite";

const server = await preview({
  root: "apps/web",
  preview: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true
  }
});

const shutdown = async () => {
  server.httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
