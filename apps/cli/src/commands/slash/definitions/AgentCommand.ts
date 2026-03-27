import { SlashCommand, type AgentCommandContext } from "../types.js";

export class AgentCommand implements SlashCommand {
  name = "agent";
  description = "List or switch active primary agent";

  async execute(args: string[], context: AgentCommandContext): Promise<void> {
    const getActive = context.getActiveAgentId;
    const setActive = context.setActiveAgentId;
    const planController = context.planSessionController;

    if (!getActive || !setActive) {
      console.log("Agent runtime controls not available.");
      return;
    }

    const action = (args[0] || "status").toLowerCase();

    if (action === "status") {
      console.log(`Active agent: ${getActive()}`);
      return;
    }

    if (action === "list") {
      console.log("Available primary agents: build, plan");
      return;
    }

    if (action === "use") {
      const target = (args[1] || "").trim().toLowerCase();
      if (!target) {
        console.log("Usage: /agent use <build|plan>");
        return;
      }

      if (planController && !planController.canSwitchToAgent(target)) {
        console.log("Build agent is locked while a plan is waiting. Use /plan apply or /plan cancel.");
        return;
      }

      const ok = setActive(target);
      if (!ok) {
        console.log(`Unknown agent: ${target}`);
        return;
      }
      console.log(`Active agent switched to: ${target}`);
      return;
    }

    console.log("Usage: /agent [status|list|use <id>]");
  }
}
