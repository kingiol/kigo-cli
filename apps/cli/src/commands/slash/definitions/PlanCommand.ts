import { SlashCommand, type PlanCommandContext } from "../types.js";

export class PlanCommand implements SlashCommand {
  name = "plan";
  description = "Manage the plan workflow and approval gate";

  async execute(args: string[], context: PlanCommandContext): Promise<void> {
    const getState = context.isPlanModeEnabled;
    const setState = context.setPlanModeEnabled;
    const setAgent = context.setActiveAgentId;
    const controller = context.planSessionController;

    if (!getState || !setState || !setAgent || !controller) {
      console.log("Plan workflow controls not available.");
      return;
    }

    const action = (args[0] || "status").toLowerCase();

    if (action === "status") {
      const summary = controller.describe();
      console.log(
        [
          `Plan mode: ${getState() ? "enabled" : "disabled"}`,
          `Plan state: ${summary.state}`,
          `Plan file: ${summary.path}`,
          `HasDraft: ${summary.hasDraft ? "yes" : "no"}`,
          `SavedAt: ${summary.savedAt || "(not saved)"}`,
        ].join("\n"),
      );
      return;
    }

    if (action === "on" || action === "enter") {
      controller.enter();
      setAgent("plan");
      setState(true);
      console.log("Plan mode enabled. Drafts now auto-save after each planning reply. Use /plan approve and /plan apply when ready.");
      return;
    }

    if (action === "save") {
      const latestAssistant = [...context.agent.getMessages()]
        .reverse()
        .find((message) => message.role === "assistant" && message.content.trim().length > 0);

      if (!latestAssistant) {
        console.log("No assistant plan content found to save.");
        return;
      }

      const filePath = await controller.savePlan(latestAssistant.content);
      console.log(`Plan saved to ${filePath}`);
      return;
    }

    if (action === "approve") {
      const ok = await controller.approve();
      if (!ok) {
        console.log("No plan draft found yet. Ask Kigo for the plan first, or use /plan save manually.");
        return;
      }
      console.log("Plan approved. Run /plan apply to unlock execution.");
      return;
    }

    if (action === "apply") {
      const ok = await controller.apply();
      if (!ok) {
        console.log("Plan is not approved yet. Run /plan approve first.");
        return;
      }
      setAgent("build");
      setState(false);
      console.log("Plan applied. Execution tools are unlocked.");
      return;
    }

    if (action === "off" || action === "exit" || action === "cancel") {
      await controller.cancel();
      setAgent("build");
      setState(false);
      console.log("Plan workflow cancelled.");
      return;
    }

    console.log("Usage: /plan [status|on|save|approve|apply|cancel]");
  }
}
