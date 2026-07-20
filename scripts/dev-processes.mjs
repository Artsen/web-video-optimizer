import { spawn } from "node:child_process";

export function npmExecutable(platform = process.platform) {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export function createNpmCommand(args, options = {}) {
  return {
    command: npmExecutable(options.platform),
    args
  };
}

export function createDevPlan(options = {}) {
  return {
    build: createNpmCommand(["run", "build:packages"], options),
    children: [
      {
        label: "api",
        ...createNpmCommand(["run", "dev", "--workspace", "apps/api"], options)
      },
      {
        label: "web",
        ...createNpmCommand(["run", "dev", "--workspace", "apps/web"], options)
      }
    ]
  };
}

export function terminateProcessTree(child, options = {}) {
  if (!child || child.exitCode !== null || child.killed) return;
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    const spawnProcess = options.spawnProcess ?? spawn;
    spawnProcess("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    return;
  }
  child.kill("SIGTERM");
}

export async function runDevLauncher(options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn;
  const logger = options.logger ?? console;
  const platform = options.platform ?? process.platform;
  const signalSource = options.signalSource ?? process;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const npmExecPath = options.npmExecPath ?? process.env.npm_execpath;
  const plan = createDevPlan({ platform });
  const children = new Set();
  let shuttingDown = false;
  let exitCode = 0;
  let shutdownHandler;

  const spawnStep = (step) => {
    try {
      return spawnProcess(step.command, step.args, {
        stdio: "inherit",
        shell: false,
        windowsHide: true
      });
    } catch (error) {
      if (platform !== "win32" || error?.code !== "EINVAL") throw error;
      logger.error(`[${step.label ?? "build"}] inherited terminal output was unavailable; retrying with piped output.`);
      const fallbackCommand = npmExecPath
        ? { command: nodeExecutable, args: [npmExecPath, ...step.args] }
        : { command: step.command, args: step.args };
      const child = spawnProcess(fallbackCommand.command, fallbackCommand.args, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true
      });
      child.stdout?.on("data", (chunk) => stdout.write(chunk));
      child.stderr?.on("data", (chunk) => stderr.write(chunk));
      return child;
    }
  };

  const stopChildren = () => {
    shuttingDown = true;
    for (const child of children) terminateProcessTree(child, { platform, spawnProcess });
  };

  const runCommand = (step) =>
    new Promise((resolve) => {
      let child;
      try {
        child = spawnStep(step);
      } catch (error) {
        logger.error(`[${step.label ?? "build"}] ${error.message}`);
        resolve(1);
        return;
      }
      child.on("error", (error) => {
        logger.error(`[${step.label ?? "build"}] ${error.message}`);
        resolve(1);
      });
      child.on("exit", (code, signal) => {
        if (signal) logger.error(`[${step.label ?? "build"}] exited from ${signal}`);
        resolve(code ?? (signal ? 1 : 0));
      });
    });

  logger.log("Building shared packages...");
  const buildCode = await runCommand({ label: "build", ...plan.build });
  if (buildCode !== 0) return buildCode;

  logger.log("Starting Web Video Optimizer development services...");
  logger.log("Web: http://localhost:5173");
  logger.log("API: http://localhost:4000");
  logger.log("Health: http://localhost:4000/health");
  logger.log("Readiness: http://localhost:4000/ready");

  await new Promise((resolve) => {
    const finish = (code) => {
      if (shuttingDown) return;
      exitCode = code;
      stopChildren();
      resolve();
    };

    for (const step of plan.children) {
      let child;
      try {
        child = spawnStep(step);
      } catch (error) {
        logger.error(`[${step.label}] ${error.message}`);
        finish(1);
        return;
      }
      children.add(child);
      child.on("error", (error) => {
        logger.error(`[${step.label}] ${error.message}`);
        finish(1);
      });
      child.on("exit", (code, signal) => {
        children.delete(child);
        if (!shuttingDown) {
          logger.error(`[${step.label}] exited unexpectedly${signal ? ` from ${signal}` : ` with code ${code ?? 0}`}`);
          finish(code && code !== 0 ? code : 1);
        }
        if (shuttingDown && children.size === 0) resolve();
      });
    }

    shutdownHandler = () => {
      if (!shuttingDown) {
        exitCode = 0;
        stopChildren();
      }
    };
    signalSource.once("SIGINT", shutdownHandler);
    signalSource.once("SIGTERM", shutdownHandler);
  });

  if (shutdownHandler) {
    signalSource.off?.("SIGINT", shutdownHandler);
    signalSource.off?.("SIGTERM", shutdownHandler);
  }

  return exitCode;
}
