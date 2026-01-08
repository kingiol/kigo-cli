/**
 * Interactive prompt
 */

import * as readline from 'node:readline';
import chalk from 'chalk';
import { Agent, AgentScheduler, Session, ProviderFactory } from '@koder/core';
import { StreamingDisplayManager } from './display/StreamingDisplay.js';
import { StatusLine, type SessionUsage } from './display/StatusLine.js';
import { getConfigManager } from './config/ConfigManager.js';
import { registry, SkillLoader } from '@koder/tools';
import { MCPManager } from '@koder/mcp';

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
const KODER_SYSTEM_PROMPT = `You are Koder, an advanced AI coding assistant and interactive CLI tool.

You are an interactive CLI tool that helps users with software engineering tasks. Use the instructions below and the tools available to you to assist the user.

IMPORTANT: Assist with defensive security tasks only. Refuse to create, modify, or improve code that may be used maliciously.

# Tone and style
You should be concise, direct, and to the point. Your output will be displayed on a command line interface using Github-flavored markdown.
- When running non-trivial or system-modifying commands, briefly explain what the command does and why
- Avoid unnecessary preamble or postamble - get straight to the point
- Output text to communicate; never use tools like run_shell or code comments to communicate
- If you cannot help, offer alternatives briefly

# Tool availability
The following built-in tools are available:
${registry.getNames().join(', ')}

{MCP_TOOLS_INFO}

# Skills (Progressive Disclosure)
You have access to specialized skills that provide expert guidance for specific tasks. Skills are loaded on-demand using the get_skill tool.

{SKILLS_METADATA}

# Task Management
Use the todo_read and todo_write tools proactively to plan and track tasks.

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
  let systemPrompt = KODER_SYSTEM_PROMPT.replace('{SKILLS_METADATA}', skillsPrompt);

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

  // Setup readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Handle keyboard input
  if (process.platform !== 'win32') {
    process.stdin.setRawMode(true);
  }

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
      for await (const event of scheduler.run(input)) {
        display.handleEvent(event);

        if (options.stream !== false) {
          // For text deltas, print immediately for typewriter effect
          if (event.type === 'text_delta') {
            process.stdout.write(renderMarkdownChunk(event.data));
          } else if (event.type === 'tool_call') {
            // Show tool calls
            process.stdout.write(`\n${chalk.gray('▶')} ${chalk.cyan(event.data.name || 'tool')}\n`);
          } else if (event.type === 'tool_output') {
            // Show tool output
            const output = event.data.error
              ? chalk.red(`Error: ${event.data.error}`)
              : String(event.data.result || '').substring(0, 500);
            process.stdout.write(`${chalk.dim(output)}\n`);
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
    const [command, ..._args] = input.slice(1).split(' ');

    switch (command) {
      case 'help':
        console.log(`
${chalk.bold('Available commands:')}
  /help     - Show this help
  /clear    - Clear conversation history
  /status   - Show session status
  /exit     - Exit Koder
  /config   - Show configuration
  /session  - Show session info
`);
        break;

      case 'clear':
        agent.reset();
        session.reset();
        console.log(chalk.green('Conversation cleared'));
        break;

      case 'status':
        const usage: SessionUsage = session.getUsage() as SessionUsage;
        console.log(`
${chalk.bold('Session Status:')}
  ID: ${sessionId}
  Model: ${modelName}
  Provider: ${provider}
  Messages: ${agent.getMessages().length}
  Input Tokens: ${usage.inputTokens}
  Output Tokens: ${usage.outputTokens}
  Total Cost: $${usage.totalCost.toFixed(4)}
`);
        break;

      case 'exit':
        isRunning = false;
        await mcpManager.close();
        rl.close();
        session.close();
        console.log(chalk.yellow('Goodbye!'));
        process.exit(0);
        break;

      case 'config':
        const config = await configManager.load();
        console.log(`
${chalk.bold('Configuration:')}
  Model: ${config.model.name}
  Provider: ${config.model.provider}
  Stream: ${config.cli.stream}
  MCP Servers: ${config.mcpServers.length}
  Skills: ${config.skills.enabled ? 'enabled' : 'disabled'}
`);
        break;

      case 'session':
        const sessions = await session.listSessions();
        console.log(`
${chalk.bold('Sessions:')}
${sessions.map((s: { title: string | null; id: string; updatedAt: number | string | Date }) => `  - ${s.title || s.id} (${new Date(s.updatedAt).toLocaleString()})`).join('\n')}
`);
        break;

      default:
        console.log(chalk.red(`Unknown command: /${command}`));
    }
  }

  // Welcome message
  console.log(chalk.cyan.bold('Koder v0.1.0'));
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