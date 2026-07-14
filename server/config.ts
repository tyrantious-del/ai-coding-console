import os from "node:os";
import path from "node:path";

export interface AppConfig {
  claudeDir: string;
  codexDir: string;
  copilotDir: string;
  statePath: string;
  watch: boolean;
}

export function expandHome(input: string): string {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

export function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    claudeDir: expandHome(process.env.MODEL_MANAGER_CLAUDE_DIR ?? path.join(os.homedir(), ".claude")),
    codexDir: expandHome(process.env.MODEL_MANAGER_CODEX_DIR ?? path.join(os.homedir(), ".codex")),
    copilotDir: expandHome(process.env.MODEL_MANAGER_COPILOT_DIR ?? path.join(os.homedir(), ".copilot")),
    statePath: expandHome(process.env.AI_CODING_CONSOLE_STATE ?? path.join(process.cwd(), ".ai-coding-console", "state.json")),
    watch: process.env.MODEL_MANAGER_WATCH !== "0",
    ...overrides
  };
}
