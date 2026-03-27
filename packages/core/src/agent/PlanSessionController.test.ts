import { describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { PlanSessionController } from "./PlanSessionController.js";

describe("PlanSessionController", () => {
  it("blocks mutating tools while plan approval is pending", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kigo-plan-"));
    const controller = new PlanSessionController(projectRoot, "session_test");

    controller.enter();

    const readDecision = controller.evaluateTool(
      "read_file",
      { path: "README.md" },
      "builtin",
    );
    const writeDecision = controller.evaluateTool(
      "write_file",
      { path: "README.md", content: "x" },
      "builtin",
    );

    expect(readDecision.allowed).toBe(true);
    expect(writeDecision.allowed).toBe(false);
    expect(controller.canSwitchToAgent("build")).toBe(false);
  });

  it("requires a saved plan before approve and apply", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kigo-plan-"));
    const controller = new PlanSessionController(projectRoot, "session_test");

    controller.enter();
    await expect(controller.approve()).resolves.toBe(false);

    const filePath = await controller.savePlan("Implementation outline");
    expect(await fs.readFile(filePath, "utf-8")).toContain("Implementation outline");

    await expect(controller.approve()).resolves.toBe(true);
    await expect(controller.apply()).resolves.toBe(true);
    expect(controller.evaluateTool("write_file", { path: "README.md" }, "builtin").allowed).toBe(true);
    expect(controller.canSwitchToAgent("build")).toBe(true);
  });

  it("auto-saves updated drafts while plan mode is active", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kigo-plan-"));
    const controller = new PlanSessionController(projectRoot, "session_test");

    controller.enter();
    const filePath = await controller.captureDraft("Step 1\nStep 2");

    expect(filePath).not.toBeNull();
    expect(await fs.readFile(filePath!, "utf-8")).toContain("Step 1");
    expect(controller.describe().hasDraft).toBe(true);

    const secondSave = await controller.captureDraft("Step 1\nStep 2");
    expect(secondSave).toBeNull();
  });
});
