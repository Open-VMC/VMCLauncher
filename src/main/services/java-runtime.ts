import { access, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { downloadFile, resolveTemurinBinaryUrl } from "./downloads";

const execFileAsync = promisify(execFile);

export class JavaRuntimeManager {
  constructor(
    private readonly runtimesDir: string,
    private readonly cacheDir: string,
  ) {}

  async ensureJavaExecutable(): Promise<string> {
    const runtimeRoot = path.join(this.runtimesDir, "temurin-21", `${process.platform}-${process.arch}`);
    const existing = await findJavaExecutable(runtimeRoot);
    if (existing) {
      return existing;
    }

    await mkdir(runtimeRoot, { recursive: true });
    const extension = process.platform === "win32" ? "zip" : "tar.gz";
    const archivePath = path.join(this.cacheDir, `temurin-21-${process.platform}-${process.arch}.${extension}`);

    let downloadError: Error | null = null;
    for (const imageType of ["jre", "jdk"] as const) {
      try {
        await downloadFile(resolveTemurinBinaryUrl(process.platform, process.arch, imageType), archivePath);
        await this.extractArchive(archivePath, runtimeRoot);
        const resolved = await findJavaExecutable(runtimeRoot);
        if (resolved) {
          return resolved;
        }
      } catch (error) {
        downloadError = error as Error;
      }
    }

    throw downloadError ?? new Error("Impossible d'installer le runtime Java OpenVMC.");
  }

  private async extractArchive(archivePath: string, runtimeRoot: string): Promise<void> {
    if (process.platform === "win32") {
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -Force -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${runtimeRoot.replace(/'/g, "''")}'`,
      ]);
      return;
    }

    await execFileAsync("tar", ["-xzf", archivePath, "-C", runtimeRoot]);
  }
}

async function findJavaExecutable(rootDir: string): Promise<string | null> {
  const candidates: string[] = [];
  await collectCandidates(rootDir, candidates, 0);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Ignore unreadable candidates.
    }
  }

  return null;
}

async function collectCandidates(rootDir: string, candidates: string[], depth: number): Promise<void> {
  if (depth > 4) {
    return;
  }

  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const directJava = process.platform === "win32"
        ? path.join(entryPath, "bin", "java.exe")
        : path.join(entryPath, "bin", "java");
      const macJava = path.join(entryPath, "Contents", "Home", "bin", "java");
      candidates.push(directJava, macJava);
      await collectCandidates(entryPath, candidates, depth + 1);
    }
  }
}
