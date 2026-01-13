/**
 * Interactive prompt
 */

import * as readline from 'node:readline';
import chalk from 'chalk';
import { Agent, AgentScheduler, Session, ProviderFactory } from '@kigo/core';
import { StreamingDisplayManager } from './display/StreamingDisplay.js';
import { StatusLine, type SessionUsage } from './display/StatusLine.js';
import { getConfigManager } from './config/ConfigManager.js';
import { registry, SkillLoader } from '@kigo/tools';
import { MCPManager } from '@kigo/mcp';
import { ToolRenderer } from './display/ToolRenderer.js';
import { SlashCommandRegistry } from './commands/slash/Registry.js';
import { HelpCommand } from './commands/slash/definitions/HelpCommand.js';
import { ClearCommand } from './commands/slash/definitions/ClearCommand.js';
import { StatusCommand } from './commands/slash/definitions/StatusCommand.js';
import { ExitCommand } from './commands/slash/definitions/ExitCommand.js';
import { ConfigCommand } from './commands/slash/definitions/ConfigCommand.js';
import { SessionCommand } from './commands/slash/definitions/SessionCommand.js';

// Simple markdown renderer for streaming text
function renderMarkdownChunk(text: string): string {
  let rendered = text;

  // Inline code
  rendered = rendered.replace(/`([^`]+)`/g, (_, code) => chalk.cyan(`\`${code}\``));

  // Bold
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, (_, text) => chalk.bold(text));

  // Italic
  rendered = rendered.replace(/\*([^*]+)\*/g, (_, text) => chalk.italic(text));

  return rendered;
}

// System prompt
// System prompt
const KIGO_SYSTEM_TEMPLATE = `You are Kigo, an advanced AI coding assistant and interactive CLI tool.

You are an interactive CLI tool that helps users with software engineering tasks. Use the instructions below and the tools available to you to assist the user.

IMPORTANT: Assist with defensive security tasks only. Refuse to create, modify, or improve code that may be used maliciously.

# Tone and style
You should be concise, direct, and to the point. Your output will be displayed on a command line interface using Github-flavored markdown.
- When running non-trivial or system-modifying commands, briefly explain what the command does and why
- Avoid unnecessary preamble or postamble - get straight to the point
- Output text to communicate with the user; use tools to perform actions
- If you cannot help, offer alternatives briefly

# Tool usage policy
The following built-in tools are available:
{BUILTIN_TOOLS}

{MCP_TOOLS_INFO}

# CRITICAL: Using Tools to Perform Actions
**ALWAYS use the appropriate tools to actually perform tasks. DO NOT just show commands in code blocks.**

Examples:
- To create/modify files: Use write_file or edit_file tools
- To run commands: Use run_shell tool
- To read files: Use read_file tool
- To search: Use glob_search or grep_search tools

When the user asks you to create files or run commands, you MUST call the corresponding tools.
DO NOT output bash/shell commands, file content, or JSON data in markdown code blocks as a substitute for using tools.
If you output a code block for a file without calling write_file, you have FAILED. Use the tools!

# Examples of CORRECT behavior
User: "Create a todo list website"
Assistant: (Calls tool 'todo_write' with args { "todos": [...] })
Assistant: I have initialized the task list. Now I will create the files.
Assistant: (Calls tool 'write_file' with args { "path": "index.html", "content": "..." })

# Examples of INCORRECT behavior (FAILURE)
User: "Create a todo list website"
Assistant: \`\`\`json
{ "todos": [...] }
\`\`\`
Assistant: \`\`\`html
  < !DOCTYPE html >...
\`\`\`

# Task Management Workflow (MANDATORY)
You MUST use the 'todo_write' tool to plan and track your complex tasks.
1. When receiving a complex request, first use 'todo_write' to create a plan with 'pending' status.
2. Execute the first step.
3. Use 'todo_write' to mark the item as 'completed' or 'in_progress'.
4. Repeat.
5. THIS IS MANDATORY. You must visualize the plan for the user for mult-step tasks.

# Skills (Progressive Disclosure)
You have access to specialized skills that provide expert guidance for specific tasks. Skills are loaded on-demand using the get_skill tool.

{SKILLS_METADATA}

# Doing tasks
The user will primarily request you perform software engineering tasks. This includes solving bugs, adding new functionality, refactoring code, explaining code, and more.
- Use the available search tools to understand the codebase
- Implement the solution using all tools available to you
- Verify the solution if possible with tests

# Tool usage policy
- When doing file search, prefer using the task_delegate tool to reduce context usage
- You have the capability to call multiple tools in a single response. When multiple independent pieces of information are requested, batch your tool calls together.
`;

export interface InteractiveOptions {
  session?: string;
  stream?: boolean;
  model?: string;
}

export async function runInteractive(
  configManager: Awaited<ReturnType<typeof getConfigManager>>,
  options: InteractiveOptions
): Promise<void> {
  // Load skills metadata
  const skillLoader = new SkillLoader();
  const skillsMetadata = await skillLoader.discoverSkills();
  const skillsPrompt =
    skillsMetadata.length > 0
      ? skillsMetadata.map((s: { name: string; description: string }) => `- ${s.name}: ${s.description}`).join('\n')
      : 'No skills available.';

  // Build system prompt with MCP tools info
  const builtinTools = registry.getNames().join(', ');
  let systemPrompt = KIGO_SYSTEM_TEMPLATE
    .replace('{BUILTIN_TOOLS}', builtinTools)
    .replace('{SKILLS_METADATA}', skillsPrompt);

  // Initialize MCP tools
  const mcpManager = new MCPManager();
  const mcpServers = await configManager.getMCPServers();
  if (mcpServers.length > 0) {
    await mcpManager.initialize(mcpServers);
    const mcpToolCount = mcpManager.getToolCount();
    if (mcpToolCount > 0) {
      const connectedServers = mcpManager.getConnectedServers();
      console.log(chalk.dim(`MCP: Connected to ${connectedServers.length} server(s), ${mcpToolCount} tool(s)`));

      // Add MCP tools info to system prompt
      const mcpToolsInfo = mcpManager.getTools().map((t: { name: string; description: string }) => `- ${t.name}: ${t.description}`).join('\n');
      systemPrompt = systemPrompt.replace('{MCP_TOOLS_INFO}', `\n# MCP Tools\nAdditional tools from MCP servers:\n${mcpToolsInfo}\n`);
    } else {
      systemPrompt = systemPrompt.replace('{MCP_TOOLS_INFO}', '');
    }
  } else {
    systemPrompt = systemPrompt.replace('{MCP_TOOLS_INFO}', '');
  }

  // Get model configuration
  const modelName = configManager.getModelName(options.model);
  const provider = configManager.getProvider();
  const apiKey = configManager.getApiKey();
  const baseUrl = configManager.getBaseUrl();

  if (!apiKey) {
    console.error(
      chalk.red('No API key found. Please set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable.')
    );
    process.exit(1);
  }

  // Create provider
  const llmProvider = ProviderFactory.create({
    provider,
    apiKey,
    baseURL: baseUrl,
    model: modelName,
  });

  // Create session
  const session = new Session(options.session);
  const sessionId = session.getId();

  // Combine built-in tools with MCP tools
  const allTools = [...registry.getAll(), ...mcpManager.getTools()];

  // Create agent
  const agent = new Agent({
    provider: llmProvider,
    systemPrompt,
    tools: allTools,
  });

  // Create scheduler
  const scheduler = new AgentScheduler(agent, {
    sessionId,
    streaming: options.stream !== false,
  });

  // Create display components
  const display = new StreamingDisplayManager();
  const statusLine = new StatusLine(sessionId, modelName);

  // Initialize slash command registry
  const slashRegistry = new SlashCommandRegistry();
  slashRegistry.register(new HelpCommand());
  slashRegistry.register(new ClearCommand());
  slashRegistry.register(new StatusCommand());
  slashRegistry.register(new ExitCommand());
  slashRegistry.register(new ConfigCommand());
  slashRegistry.register(new SessionCommand());

  // Setup readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line: string) => {
      if (!line.startsWith('/')) {
        return [[], line];
      }
      const hits = slashRegistry.getAll()
        .map((c) => '/' + c.name)
        .filter((c) => c.startsWith(line));
      return [hits, line];
    },
  });

  // Handle keyboard input
  if (process.platform !== 'win32') {
    process.stdin.setRawMode(true);
  }

  readline.emitKeypressEvents(process.stdin);

  process.stdin.on('keypress', (_str, key) => {
    if (!isRunning) return;

    // Wait for readline to update internal state
    setTimeout(() => {
      // Logic for live suggestions
      const line = rl.line;
      if (line && line.startsWith('/')) {
        const hits = slashRegistry.getAll()
          .map((c) => '/' + c.name)
          .filter((c) => c.startsWith(line));

        if (hits.length > 0) {
          // Save cursor position
          process.stdout.write('\x1b[s');
          // Move to next line
          process.stdout.write('\n');
          // Clear line
          process.stdout.write('\x1b[2K');
          // Print suggestions
          const suggestions = hits.join('  ');
          process.stdout.write(chalk.dim(suggestions));
          // Restore cursor
          process.stdout.write('\x1b[u');
        } else {
          // Clear suggestions line if no hits but starts with /
          process.stdout.write('\x1b[s');
          process.stdout.write('\n');
          process.stdout.write('\x1b[2K');
          process.stdout.write('\x1b[u');
        }
      } else {
        // Clear suggestions line if not a slash command
        // We only clear if we previously potentially showed something? 
        // Safer to just clear line below always? No, might flicker.
        // For now, let's only clear if it WAS a slash command or simple check.
        // Actually, let's just clear the line below on every keypress if we are in prompt mode.
        // Optimization: only if we think we showed something. 
        // But for safety, clearing line below 
        // process.stdout.write('\x1b[s\n\x1b[2K\x1b[u');
        // This might be too aggressive.
      }
    }, 0);
  });

  let isRunning = true;

  // ESC key handler
  process.stdin.on('data', (key: Buffer) => {
    if (key[0] === 27 && isRunning) {
      // ESC key - cancel current operation
      console.log(chalk.yellow('\n[Cancelled]'));
      display.reset();
      showPrompt();
    }
  });

  function showPrompt(): void {
    process.stdout.write('\x1b[2K\r'); // Clear line
    process.stdout.write(chalk.blue('> '));
  }

  async function handleInput(input: string): Promise<void> {
    if (!input.trim()) {
      showPrompt();
      return;
    }

    // Handle slash commands
    if (input.startsWith('/')) {
      await handleSlashCommand(input);
      showPrompt();
      return;
    }

    // Save user message
    await session.saveMessage({ role: 'user', content: input });

    // Run agent
    display.reset();
    console.log();

    try {
      const toolCallNameMap = new Map<string, string>();
      for await (const event of scheduler.run(input)) {
        display.handleEvent(event);

        if (options.stream !== false) {
          // For text deltas, print immediately for typewriter effect
          if (event.type === 'text_delta') {
            process.stdout.write(renderMarkdownChunk(event.data));
          } else if (event.type === 'tool_call') {
            // Track tool name for output rendering
            toolCallNameMap.set(event.data.id, event.data.name);

            // Show tool calls
            let args = {};
            try {
              args = JSON.parse(event.data.arguments || '{}');
            } catch (e) {
              args = { raw: event.data.arguments };
            }
            process.stdout.write(ToolRenderer.renderToolCall(event.data.name, args));
          } else if (event.type === 'tool_output') {
            // Show tool output
            const name = toolCallNameMap.get(event.data.id) || 'tool';
            if (event.data.error) {
              process.stdout.write(chalk.red(`Error: ${event.data.error}\n`));
            } else {
              process.stdout.write(ToolRenderer.renderToolOutput(name, event.data.result));
            }
          } else if (event.type === 'error') {
            // Show errors
            process.stdout.write(chalk.red(`\nError: ${event.data}\n`));
          }
        }
      }

      // Final newline
      if (options.stream !== false) {
        console.log();
      } else {
        // Non-streaming mode: show full render at the end
        console.log(display.render());
      }

      // Save assistant messages
      const messages = agent.getMessages();
      for (const msg of messages) {
        if (msg.role === 'assistant') {
          await session.saveMessage(msg);
        }
      }

      // Update status line
      const usage: SessionUsage = session.getUsage() as SessionUsage;
      statusLine.updateUsage(usage);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    }

    showPrompt();
  }

  async function handleSlashCommand(input: string): Promise<void> {
    const context = {
      agent,
      session,
      configManager,
      mcpManager,
      registry: slashRegistry,
      cleanup: async () => {
        isRunning = false;
        await mcpManager.close();
        rl.close();
        session.close();
      }
    };
    await slashRegistry.execute(input, context);
  }

  // Welcome message
  console.log(chalk.cyan.bold('Kigo v0.1.0'));
  console.log(chalk.dim('AI coding assistant for the terminal'));
  console.log(chalk.dim('Type /help for available commands\n'));

  showPrompt();

  // Cleanup on exit
  const cleanup = async () => {
    await mcpManager.close();
  };

  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
  });

  // Main loop
  for await (const line of rl) {
    await handleInput(line);
  }
}