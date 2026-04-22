import type { VmcLauncherApi } from "@shared/contracts";

declare global {
  interface Window {
    vmcLauncher: VmcLauncherApi;
  }
}

export {};
