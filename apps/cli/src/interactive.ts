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

  // Menu state
  let menuActive = false;
  let selectedIndex = 0;
  let suggestions: { name: string; description: string }[] = [];
  let renderedLines = 0;
  let lastLine = '';
  let pendingSelection: string | null = null;
  let ignoreKeypress = false; // Flag to prevent triggering menu on programmatic writes
  let renderTimeout: NodeJS.Timeout | null = null;

  function renderMenu() {
    // 1. Hide cursor
    process.stdout.write('\x1b[?25l');

    // Calculate prompt width ("> " is length 2)
    const promptWidth = 2;
    const cursorCol = (rl.cursor || 0) + promptWidth;

    // 2. Move down to start rendering (Relative)
    process.stdout.write('\n');

    // 3. Render items
    suggestions.forEach((item, index) => {
      process.stdout.write('\x1b[2K'); // Clear line
      process.stdout.write('\r'); // Start of line

      const cmdStr = `/${item.name}`.padEnd(15);
      const descStr = item.description;
      const lineContent = ` ${cmdStr} - ${descStr} `;

      if (index === selectedIndex) {
        process.stdout.write(chalk.bgBlue.bold.white(lineContent));
      } else {
        process.stdout.write(chalk.dim(lineContent));
      }
      process.stdout.write('\n');
    });

    // 4. Clear remaining lines from previous render
    const newRenderedLines = suggestions.length;
    if (renderedLines > newRenderedLines) {
      for (let i = newRenderedLines; i < renderedLines; i++) {
        process.stdout.write('\x1b[2K\n');
      }
    }

    // Total lines we moved down = new items + cleared lines
    const totalLinesDown = Math.max(renderedLines, newRenderedLines);

    renderedLines = totalLinesDown; // Update state

    // 5. Move back up relative to where we started
    process.stdout.write(`\x1b[${totalLinesDown + 1}A`);

    // 6. Move cursor to correct column
    process.stdout.write('\r'); // Start of line
    if (cursorCol > 0) {
      process.stdout.write(`\x1b[${cursorCol}C`);
    }

    // 7. Show cursor
    process.stdout.write('\x1b[?25h');
  }

  function clearMenu() {
    if (renderedLines > 0) {
      process.stdout.write('\x1b[?25l');

      const promptWidth = 2;
      const cursorCol = (rl.cursor || 0) + promptWidth;

      // Move down
      process.stdout.write('\n');
      for (let i = 0; i < renderedLines; i++) {
        process.stdout.write('\x1b[2K\n');
      }

      // Move up relative
      process.stdout.write(`\x1b[${renderedLines + 1}A`);

      // Restore column
      process.stdout.write('\r');
      if (cursorCol > 0) {
        process.stdout.write(`\x1b[${cursorCol}C`);
      }

      process.stdout.write('\x1b[?25h');
      renderedLines = 0;
    }
  }

  process.stdin.on('keypress', (_str, key) => {
    if (!isRunning || ignoreKeypress) return;

    // Clear any pending render timeout
    if (renderTimeout) {
      clearTimeout(renderTimeout);
      renderTimeout = null;
    }

    // Handle navigation when menu is active
    if (menuActive) {
      if (key.name === 'up') {
        selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
        renderMenu();
        return;
      }
      if (key.name === 'down') {
        selectedIndex = (selectedIndex + 1) % suggestions.length;
        renderMenu();
        return;
      }
      if (key.name === 'tab') {
        if (suggestions[selectedIndex]) {
          const completion = '/' + suggestions[selectedIndex].name;
          // Update readline line
          ignoreKeypress = true;
          rl.write(null, { ctrl: true, name: 'u' }); // Delete line
          rl.write(completion + ' '); // Write completion
          ignoreKeypress = false;

          menuActive = false;
          clearMenu();
          return;
        }
      }
      if (key.name === 'return') {
        if (suggestions[selectedIndex]) {
          // For Enter, we don't update readline here because it will trigger 'line' event anyway.
          // We save the selection to be handled in handleInput.
          pendingSelection = '/' + suggestions[selectedIndex].name;
          menuActive = false;
          clearMenu();
          if (renderTimeout) {
            clearTimeout(renderTimeout);
            renderTimeout = null;
          }
          // Let readline handle the Enter key naturally
          return;
        }
      }
      if (key.name === 'escape') {
        if (menuActive) {
          menuActive = false;
          clearMenu();
          if (renderTimeout) {
            clearTimeout(renderTimeout);
            renderTimeout = null;
          }
          return;
        }

        // Global cancel if menu is not active
        console.log(chalk.yellow('\n[Cancelled]'));
        // Clear input
        rl.write(null, { ctrl: true, name: 'u' });
        display.reset();
        showPrompt();
        return;
      }
    }

    // Wait for readline to update internal state
    renderTimeout = setTimeout(() => {
      const line = rl.line;
      if (line && line.startsWith('/')) {
        const hits = slashRegistry.getAll()
          .filter((c) => ('/' + c.name).startsWith(line))
          .map(c => ({ name: c.name, description: c.description }));

        if (hits.length > 0) {
          suggestions = hits;

          // Reset selection if input changed (default to first match)
          if (line !== lastLine) {
            selectedIndex = 0;
            lastLine = line;
          } else {
            // Keep selected index within bounds
            if (selectedIndex >= suggestions.length) selectedIndex = 0;
          }

          menuActive = true;
          renderMenu();
        } else {
          menuActive = false;
          clearMenu();
          lastLine = line;
        }
      } else {
        if (menuActive) {
          menuActive = false;
          clearMenu();
        }
        lastLine = line || '';
      }
    }, 0);
  });

  let isRunning = true;

  function showPrompt(): void {
    process.stdout.write('\x1b[2K\r'); // Clear line
    process.stdout.write(chalk.blue('> '));
  }

  async function handleInput(input: string): Promise<void> {
    if (pendingSelection) {
      // User pressed Enter to select a menu item
      const completion = pendingSelection;
      pendingSelection = null;

      // Move cursor up to overwrite the line where Enter was pressed
      process.stdout.write('\x1b[1A');

      // Show the completed command in the prompt
      showPrompt();

      ignoreKeypress = true;
      rl.write(completion + ' ');
      ignoreKeypress = false;
      return;
    }

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