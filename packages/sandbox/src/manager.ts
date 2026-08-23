/**
 * SandboxManager. Per CLAUDE.md §13:
 *   Tool Manager → Execution Policy → Sandbox Manager → Sandbox Instance
 *
 * Chooses the driver (docker|local) and stamps resource limits from config.
 */

import type { AppConfig } from "@openlobster/config";
import { DockerSandbox } from "./docker";
import { LocalSandbox } from "./local";
import type { Sandbox, SandboxSpec } from "./types";

export type SandboxDriver = "docker" | "local";

export class SandboxManager {
  constructor(
    private readonly cfg: AppConfig,
    private readonly driver: SandboxDriver,
  ) {}

  create(spec: Omit<SandboxSpec, "cpuLimit" | "memoryLimit" | "diskLimit" | "timeoutSeconds" | "networkPolicy">): Sandbox {
    const full: SandboxSpec = {
      ...spec,
      cpuLimit: this.cfg.sandbox.cpuLimit,
      memoryLimit: this.cfg.sandbox.memoryLimit,
      diskLimit: this.cfg.sandbox.diskLimit,
      timeoutSeconds: this.cfg.sandbox.timeoutSeconds,
      networkPolicy: this.driver === "docker" ? "none" : "open",
    };
    if (this.driver === "docker") {
      return new DockerSandbox(full, this.cfg.sandbox.image);
    }
    if (this.cfg.isProduction) {
      // Hard guard: the dev-only driver must never serve production traffic.
      throw new Error("Refusing to use local sandbox driver in production");
    }
    return new LocalSandbox(full);
  }
}
