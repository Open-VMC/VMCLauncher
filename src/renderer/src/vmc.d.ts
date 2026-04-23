import type { VmcLauncherApi } from "../../shared/contracts";

declare global {
  interface Window {
    vmcLauncher: VmcLauncherApi;
    electronAPI: {
      versions: NodeJS.ProcessVersions;
      platform: NodeJS.Platform;
      getPathForFile(file: File): string;
    };
  }
}

export {};
