import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";

export async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function walkFiles(root: string, predicate: (filePath: string) => boolean): Promise<string[]> {
  if (!(await exists(root))) return [];
  const found: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(next);
      } else if (entry.isFile() && predicate(next)) {
        found.push(next);
      }
    }
  }

  return found;
}

export async function fileTimestamp(filePath: string): Promise<string | undefined> {
  try {
    return (await stat(filePath)).mtime.toISOString();
  } catch {
    return undefined;
  }
}

export async function readFileSample(filePath: string, bytes = 256 * 1024): Promise<string> {
  const handle = await open(filePath, "r");
  try {
    const fileStat = await handle.stat();
    const firstLength = Math.min(bytes, fileStat.size);
    const firstBuffer = Buffer.alloc(firstLength);
    await handle.read(firstBuffer, 0, firstLength, 0);

    if (fileStat.size <= bytes * 2) {
      return firstBuffer.toString("utf8");
    }

    const secondLength = Math.min(bytes, fileStat.size - firstLength);
    const secondBuffer = Buffer.alloc(secondLength);
    await handle.read(secondBuffer, 0, secondLength, Math.max(firstLength, fileStat.size - secondLength));
    return `${firstBuffer.toString("utf8")}\n${secondBuffer.toString("utf8")}`;
  } finally {
    await handle.close();
  }
}

export function shortText(value: unknown, fallback: string, max = 96): string {
  if (typeof value !== "string") return fallback;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return fallback;
  return compact.length > max ? `${compact.slice(0, max - 1)}...` : compact;
}
