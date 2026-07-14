import { describe, expect, test } from "vitest";
import { estimateTaskTokens, estimateTokensFromText } from "../server/token-estimator";
import type { ViewedTask } from "../shared/types";

describe("token estimator", () => {
  test("estimates text with deterministic characters divided by four", () => {
    expect(estimateTokensFromText("", "Empty")).toMatchObject({
      characters: 0,
      label: "Empty",
      method: "approx_chars_div_4",
      tokens: 0
    });
    expect(estimateTokensFromText("abcd", "Short").tokens).toBe(1);
    expect(estimateTokensFromText("abcde", "Rounded").tokens).toBe(2);
    expect(estimateTokensFromText("x".repeat(401), "Long").tokens).toBe(101);
  });

  test("breaks task estimates into title, description, progress, path, and metadata parts", () => {
    const task: ViewedTask = {
      id: "codex:1",
      agent: "codex",
      nativeId: "1",
      title: "Trim auth controller",
      description: "Extract only the selected function and dependency signatures.",
      status: "in_progress",
      projectPath: "C:\\Projects\\console",
      sourcePath: "C:\\Projects\\console\\src\\auth.ts",
      dependencies: { blocks: [], blockedBy: [] },
      progressItems: [{ id: "p1", title: "Parse AST", status: "completed", source: "plan" }],
      metadata: { model: "gpt-5.5", provider: "openai" }
    };

    const estimate = estimateTaskTokens(task);

    expect(estimate.tokens).toBeGreaterThan(0);
    expect(estimate.breakdown?.map((part) => part.label)).toEqual(["Title", "Description", "Progress", "Path", "Metadata"]);
  });
});
