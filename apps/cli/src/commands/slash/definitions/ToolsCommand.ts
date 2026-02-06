import chalk from "chalk";
import { SlashCommand, CommandContext } from "../types.js";

export class ToolsCommand implements SlashCommand {
  name = "tools";
  description = "Search available tools by name or description";

  async execute(args: string[], context: CommandContext): Promise<void> {
    const catalog = context.toolsCatalog || [];
    if (catalog.length === 0) {
      console.log("No tools available.");
      return;
    }

    const keyword = args.join(" ").trim().toLowerCase();
    const filtered = keyword
      ? catalog.filter(
          (tool) =>
            tool.name.toLowerCase().includes(keyword) ||
            tool.description.toLowerCase().includes(keyword),
        )
      : catalog;

    if (filtered.length === 0) {
      console.log(`No tools matched: ${keyword}`);
      return;
    }

    console.log(`\n${chalk.bold("Tools:")} (${filtered.length})`);
    for (const tool of filtered) {
      console.log(`  - ${tool.name} [${tool.source}]`);
      console.log(`    ${tool.description}`);
    }
    console.log("");
  }
}
