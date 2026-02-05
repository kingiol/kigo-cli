/**
 * Interactive prompt
 */

import * as readline from "node:readline";
import chalk from "chalk";
import ora from "ora";
import { StreamingDisplayManager } from "./display/StreamingDisplay.js";
import { getConfigManager } from "./config/ConfigManager.js";
import { registry } from "@kigo/tools";
import { ToolRenderer } from "./display/ToolRenderer.js";
import {
  createInteractiveRuntime,
  type InteractiveOptions,
  type RuntimeEvent,
} from "./interactive/runtime.js";

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function renderInlineMarkdown(text: string): string {
  let rendered = text;

  rendered = rendered.replace(/`([^`]+)`/g, (_, code) =>
    chalk.cyan(`\`${code}\``)
  );
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, (_, boldText) =>
    chalk.bold(boldText)
  );
  rendered = rendered.replace(/\*([^*]+)\*/g, (_, italicText) =>
    chalk.italic(italicText)
  );
  rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    return chalk.blue.underline(label) + chalk.dim(` (${url})`);
  });

  return rendered;
}

class StreamingMarkdownRenderer {
  private inCodeBlock = false;
  private codeLang = "code";
  private lineBuffer = "";

  reset(): void {
    this.inCodeBlock = false;
    this.codeLang = "code";
    this.lineBuffer = "";
  }

  renderChunk(chunk: string): string {
    const text = (this.lineBuffer + chunk)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    const lines = text.split("\n");
    this.lineBuffer = lines.pop() ?? "";
    const width = getWrapWidth();
    const outputLines: string[] = [];

    for (const line of lines) {
      const rendered = this.renderLine(line, width);
      if (rendered !== null) {
        outputLines.push(rendered);
      }
    }

    if (outputLines.length === 0) {
      return "";
    }

    return outputLines.join("\n") + "\n";
  }

  flush(): string {
    if (!this.lineBuffer) {
      return "";
    }
    const width = getWrapWidth();
    const rendered = this.renderLine(this.lineBuffer, width);
    this.lineBuffer = "";
    return rendered ?? "";
  }

  private renderLine(line: string, width: number): string | null {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```")) {
      if (!this.inCodeBlock) {
        this.codeLang = trimmed.slice(3).trim() || "code";
        this.inCodeBlock = true;
        return chalk.cyan(`${this.codeLang}:`);
      }
      this.inCodeBlock = false;
      return null;
    }

    if (this.inCodeBlock) {
      return chalk.gray(line);
    }

    if (!line.trim()) {
      return "";
    }

    const indentMatch = line.match(/^\s+/);
    const indent = indentMatch ? indentMatch[0] : "";
    const content = line.slice(indent.length);

    const headerMatch = content.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const headerText = headerMatch[2];
      return wrapWithPrefix(indent, chalk.bold(headerText), width);
    }

    const quoteMatch = content.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      const quoteText = renderInlineMarkdown(quoteMatch[1]);
      const prefix = `${indent}${chalk.dim("|")} `;
      return wrapWithPrefix(prefix, quoteText, width);
    }

    const listMatch = content.match(/^([-*+]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const bullet = listMatch[1];
      const listText = renderInlineMarkdown(listMatch[2]);
      const prefix = `${indent}${chalk.dim(bullet)} `;
      return wrapWithPrefix(prefix, listText, width);
    }

    return wrapWithPrefix(indent, renderInlineMarkdown(content), width);
  }
}

function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, "");
}

function visibleLength(input: string): number {
  let length = 0;
  for (const char of stripAnsi(input)) {
    const code = char.codePointAt(0) ?? 0;
    length += code <= 0x7f ? 1 : 2;
  }
  return length;
}

function wrapWithPrefix(prefix: string, text: string, width: number): string {
  if (width <= 0) {
    return prefix + text;
  }

  const prefixLen = visibleLength(prefix);
  const available = Math.max(10, width - prefixLen);
  if (available <= 0) {
    return prefix + text;
  }

  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let currentLen = 0;

  for (const word of words) {
    const wordLen = visibleLength(word);
    if (currentLen === 0) {
      current = word;
      currentLen = wordLen;
      continue;
    }

    if (currentLen + 1 + wordLen > available) {
      lines.push(current);
      current = word;
      currentLen = wordLen;
      continue;
    }

    current += " " + word;
    currentLen += 1 + wordLen;
  }

  if (currentLen > 0) {
    lines.push(current);
  }

  if (lines.length === 0) {
    return prefix;
  }

  const continuation = " ".repeat(prefixLen);
  return lines
    .map((lineText, index) =>
      index === 0 ? prefix + lineText : continuation + lineText
    )
    .join("\n");
}

function getWrapWidth(): number {
  const columns = process.stdout.columns;
  if (!columns || columns < 40) {
    return 80;
  }
  return columns - 2;
}

type QuestionnaireState = {
  questionnaireId: string;
  questions: Array<{
    id: string;
    text: string;
    options: string[];
    allowCustom: boolean;
    customLabel: string;
  }>;
  currentIndex: number;
  answers: Array<{ questionId: string; selectedIndex?: number; customAnswer?: string }>;
  awaitingCustom: boolean;
};

export async function runInteractive(
  configManager: Awaited<ReturnType<typeof getConfigManager>>,
  options: InteractiveOptions
): Promise<void> {
  const runtime = await createInteractiveRuntime(configManager, options);
  const sessionId = runtime.getSessionId();
  const statusLine = runtime.getStatusLine();
  const slashRegistry = runtime.getSlashRegistry();

  // Create display components
  const display = new StreamingDisplayManager();
  const markdownRenderer = new StreamingMarkdownRenderer();

  // Setup readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line: string) => {
      if (!line.startsWith("/")) {
        return [[], line];
      }
      const hits = slashRegistry
        .getAll()
        .map((c) => "/" + c.name)
        .filter((c) => c.startsWith(line));
      return [hits, line];
    },
  });

  // Handle keyboard input
  if (process.platform !== "win32") {
    process.stdin.setRawMode(true);
  }

  readline.emitKeypressEvents(process.stdin);

  // Menu state
  let menuActive = false;
  let selectedIndex = 0;
  let suggestions: { name: string; description: string }[] = [];
  let renderedLines = 0;
  let lastLine = "";
  let pendingSelection: string | null = null;
  let ignoreKeypress = false; // Flag to prevent triggering menu on programmatic writes
  let renderTimeout: NodeJS.Timeout | null = null;
  let questionnaireState: QuestionnaireState | null = null;
  let questionnaireNeedsPrompt = false;
  let questionnaireIntro:
    | { title?: string; instructions?: string }
    | null = null;

  function renderMenu() {
    // 1. Hide cursor
    process.stdout.write("\x1b[?25l");

    // Calculate prompt width ("> " is length 2)
    const promptWidth = 2;
    const cursorCol = (rl.cursor || 0) + promptWidth;

    // 2. Move down to start rendering (Relative)
    process.stdout.write("\n");

    // 3. Render items
    suggestions.forEach((item, index) => {
      process.stdout.write("\x1b[2K"); // Clear line
      process.stdout.write("\r"); // Start of line

      const cmdStr = `/${item.name}`.padEnd(15);
      const descStr = item.description;
      const lineContent = ` ${cmdStr} - ${descStr} `;

      if (index === selectedIndex) {
        process.stdout.write(chalk.bgBlue.bold.white(lineContent));
      } else {
        process.stdout.write(chalk.dim(lineContent));
      }
      process.stdout.write("\n");
    });

    // 4. Clear remaining lines from previous render
    const newRenderedLines = suggestions.length;
    if (renderedLines > newRenderedLines) {
      for (let i = newRenderedLines; i < renderedLines; i++) {
        process.stdout.write("\x1b[2K\n");
      }
    }

    // Total lines we moved down = new items + cleared lines
    const totalLinesDown = Math.max(renderedLines, newRenderedLines);

    renderedLines = totalLinesDown; // Update state

    // 5. Move back up relative to where we started
    process.stdout.write(`\x1b[${totalLinesDown + 1}A`);

    // 6. Move cursor to correct column
    process.stdout.write("\r"); // Start of line
    if (cursorCol > 0) {
      process.stdout.write(`\x1b[${cursorCol}C`);
    }

    // 7. Show cursor
    process.stdout.write("\x1b[?25h");
  }

  function clearMenu() {
    if (renderedLines > 0) {
      process.stdout.write("\x1b[?25l");

      const promptWidth = 2;
      const cursorCol = (rl.cursor || 0) + promptWidth;

      // Move down
      process.stdout.write("\n");
      for (let i = 0; i < renderedLines; i++) {
        process.stdout.write("\x1b[2K\n");
      }

      // Move up relative
      process.stdout.write(`\x1b[${renderedLines + 1}A`);

      // Restore column
      process.stdout.write("\r");
      if (cursorCol > 0) {
        process.stdout.write(`\x1b[${cursorCol}C`);
      }

      process.stdout.write("\x1b[?25h");
      renderedLines = 0;
    }
  }

  process.stdin.on("keypress", (_str, key) => {
    if (!isRunning || ignoreKeypress) return;

    // Clear any pending render timeout
    if (renderTimeout) {
      clearTimeout(renderTimeout);
      renderTimeout = null;
    }

    // Handle navigation when menu is active
    if (menuActive) {
      if (key.name === "up") {
        selectedIndex =
          (selectedIndex - 1 + suggestions.length) % suggestions.length;
        renderMenu();
        return;
      }
      if (key.name === "down") {
        selectedIndex = (selectedIndex + 1) % suggestions.length;
        renderMenu();
        return;
      }
      if (key.name === "tab") {
        if (suggestions[selectedIndex]) {
          const completion = "/" + suggestions[selectedIndex].name;
          // Update readline line
          ignoreKeypress = true;
          rl.write(null, { ctrl: true, name: "u" }); // Delete line
          rl.write(completion + " "); // Write completion
          ignoreKeypress = false;

          menuActive = false;
          clearMenu();
          return;
        }
      }
      if (key.name === "return") {
        if (suggestions[selectedIndex]) {
          // For Enter, we don't update readline here because it will trigger 'line' event anyway.
          // We save the selection to be handled in handleInput.
          pendingSelection = "/" + suggestions[selectedIndex].name;
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
      if (key.name === "escape") {
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
        console.log(chalk.yellow("\n[Cancelled]"));
        // Clear input
        rl.write(null, { ctrl: true, name: "u" });
        display.reset();
        showPrompt();
        return;
      }
    }

    // Wait for readline to update internal state
    renderTimeout = setTimeout(() => {
      const line = rl.line;
      if (line && line.startsWith("/")) {
        const hits = slashRegistry
          .getAll()
          .filter((c) => ("/" + c.name).startsWith(line))
          .map((c) => ({ name: c.name, description: c.description }));

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
        lastLine = line || "";
      }
    }, 0);
  });

  let isRunning = true;

  function showPrompt(): void {
    process.stdout.write("\x1b[2K\r"); // Clear line
    process.stdout.write(chalk.blue("> "));
  }

  function showQuestionnaireIntro(): void {
    if (!questionnaireIntro) {
      return;
    }
    if (questionnaireIntro.title) {
      console.log(chalk.cyan.bold(questionnaireIntro.title));
    }
    if (questionnaireIntro.instructions) {
      console.log(chalk.dim(questionnaireIntro.instructions));
    }
    questionnaireIntro = null;
  }

  function renderCurrentQuestion(): void {
    if (!questionnaireState) {
      return;
    }
    const question = questionnaireState.questions[questionnaireState.currentIndex];
    if (!question) {
      return;
    }
    const customIndex = question.allowCustom ? question.options.length + 1 : null;
    console.log(
      chalk.cyan(
        `\n问题 ${questionnaireState.currentIndex + 1}/${questionnaireState.questions.length}: ${question.text}`
      )
    );
    question.options.forEach((option, index) => {
      console.log(`  ${index + 1}) ${option}`);
    });
    if (question.allowCustom) {
      console.log(`  ${customIndex}) ${question.customLabel}`);
    }
  }

  function showNextPrompt(): void {
    if (questionnaireState) {
      showQuestionnaireIntro();
      if (questionnaireNeedsPrompt) {
        renderCurrentQuestion();
        questionnaireNeedsPrompt = false;
      }
      process.stdout.write("\x1b[2K\r");
      let promptText = "回答> ";
      if (questionnaireState.awaitingCustom) {
        promptText = "自定义答案> ";
      } else {
        const current = questionnaireState.questions[questionnaireState.currentIndex];
        if (current) {
          const maxSelection = current.allowCustom
            ? current.options.length + 1
            : current.options.length;
          promptText = `回答(1-${maxSelection})> `;
        }
      }
      process.stdout.write(chalk.blue(promptText));
      return;
    }
    showPrompt();
  }

  async function submitQuestionnaireAnswers(state: QuestionnaireState): Promise<void> {
    const tool = registry.get("answer_questions");
    if (!tool) {
      console.error(chalk.red("Error: answer_questions tool not available."));
      questionnaireState = null;
      return;
    }

    const env = process.env;
    const prevSession = env.KIGO_SESSION_ID;
    env.KIGO_SESSION_ID = sessionId;
    let result: string;
    try {
      result = await tool.execute({
        mode: "submit",
        questionnaireId: state.questionnaireId,
        answers: state.answers,
      });
    } finally {
      if (prevSession === undefined) {
        delete env.KIGO_SESSION_ID;
      } else {
        env.KIGO_SESSION_ID = prevSession;
      }
    }

    questionnaireState = null;
    const prevSuppress = process.env.KIGO_SUPPRESS_QUESTIONNAIRE_ASK;
    process.env.KIGO_SUPPRESS_QUESTIONNAIRE_ASK = "1";
    try {
      await runAgentWithInput(
        [
          "问卷已完成。请基于以下回答继续，不要再次创建问卷，除非用户明确要求补充信息。",
          "问卷回答如下：",
          result,
        ].join("\n"),
      );
    } finally {
      if (prevSuppress === undefined) {
        delete process.env.KIGO_SUPPRESS_QUESTIONNAIRE_ASK;
      } else {
        process.env.KIGO_SUPPRESS_QUESTIONNAIRE_ASK = prevSuppress;
      }
    }
    showNextPrompt();
  }

  async function handleQuestionnaireInput(input: string): Promise<void> {
    if (!questionnaireState) {
      showNextPrompt();
      return;
    }

    const trimmed = input.trim();
    const question = questionnaireState.questions[questionnaireState.currentIndex];
    if (!question) {
      questionnaireState = null;
      showNextPrompt();
      return;
    }
    const optionCount = question.options.length;
    const customIndex = question.allowCustom ? optionCount + 1 : null;
    const maxSelection = customIndex ?? optionCount;

    if (questionnaireState.awaitingCustom) {
      if (!trimmed) {
        console.log(chalk.yellow("请输入自定义答案，不能为空。"));
        showNextPrompt();
        return;
      }
      questionnaireState.answers.push({
        questionId: question.id,
        customAnswer: trimmed,
      });
      questionnaireState.awaitingCustom = false;
      questionnaireState.currentIndex += 1;
      if (questionnaireState.currentIndex >= questionnaireState.questions.length) {
        await submitQuestionnaireAnswers(questionnaireState);
        return;
      }
      questionnaireNeedsPrompt = true;
      showNextPrompt();
      return;
    }

    const selection = Number.parseInt(trimmed, 10);
    if (Number.isNaN(selection)) {
      console.log(chalk.yellow(`请输入 1-${maxSelection} 之间的数字。`));
      questionnaireNeedsPrompt = true;
      showNextPrompt();
      return;
    }

    if (selection >= 1 && selection <= optionCount) {
      questionnaireState.answers.push({
        questionId: question.id,
        selectedIndex: selection,
      });
      questionnaireState.currentIndex += 1;
      if (questionnaireState.currentIndex >= questionnaireState.questions.length) {
        await submitQuestionnaireAnswers(questionnaireState);
        return;
      }
      questionnaireNeedsPrompt = true;
      showNextPrompt();
      return;
    }

    if (customIndex && selection === customIndex) {
      if (!question.allowCustom) {
        console.log(chalk.yellow(`该问题不支持自定义答案，请选择 1-${optionCount}。`));
        questionnaireNeedsPrompt = true;
        showNextPrompt();
        return;
      }
      questionnaireState.awaitingCustom = true;
      showNextPrompt();
      return;
    }

    console.log(chalk.yellow(`请输入 1-${maxSelection} 之间的数字。`));
    questionnaireNeedsPrompt = true;
    showNextPrompt();
  }

  async function runAgentWithInput(input: string): Promise<void> {
    // Run agent
    display.reset();
    markdownRenderer.reset();
    console.log();

    // Spinner
    const spinner = ora({
      text: "Thinking...",
      color: "cyan",
      discardStdin: false,
    });

    try {
      // Start spinner
      spinner.start();

      await runtime.runInput(input, (event: RuntimeEvent) => {
        let isQuestionnaireOutput = false;

        if (
          event.type === "tool_output" &&
          event.toolName === "answer_questions" &&
          event.questionnaire &&
          !event.data.error
        ) {
          const questionnairePayload = event.questionnaire;
          isQuestionnaireOutput = true;
          questionnaireState = {
            questionnaireId: questionnairePayload.questionnaireId,
            questions: questionnairePayload.questions.map((q) => ({
              id: q.id,
              text: q.text,
              options: q.options,
              allowCustom: q.allowCustom ?? true,
              customLabel: q.customLabel || "自定义",
            })),
            currentIndex: 0,
            answers: [],
            awaitingCustom: false,
          };
          questionnaireNeedsPrompt = true;
          questionnaireIntro = {
            title: questionnairePayload.title,
            instructions: questionnairePayload.instructions,
          };
        }

        // Stop spinner when we get an event
        if (spinner.isSpinning) {
          spinner.stop();
        }

        display.handleEvent({ type: event.type, data: event.data } as any);

        if (options.stream !== false) {
          // For text deltas, print immediately for typewriter effect
          if (event.type === "text_delta") {
            process.stdout.write(markdownRenderer.renderChunk(event.data));
          } else if (event.type === "tool_call") {
            const pending = markdownRenderer.flush();
            if (pending) {
              process.stdout.write(pending + "\n");
            }

            process.stdout.write(
              ToolRenderer.renderToolCall(event.toolName || "tool", event.toolArgs || {})
            );

            // Start spinner for execution
            spinner.text = "Executing...";
            spinner.start();
          } else if (event.type === "tool_output") {
            const pending = markdownRenderer.flush();
            if (pending) {
              process.stdout.write(pending + "\n");
            }

            if (isQuestionnaireOutput) {
              process.stdout.write(
                chalk.cyan("\n已收到问卷，请按顺序回答。\n")
              );
            } else {
              // Show tool output
              const name = event.toolName || "tool";
              if (event.data.error) {
                process.stdout.write(chalk.red(`Error: ${event.data.error}\n`));
              } else {
                process.stdout.write(
                  ToolRenderer.renderToolOutput(name, event.data.result)
                );
              }
            }

            // Back to thinking
            spinner.text = "Thinking...";
            spinner.start();
          } else if (event.type === "error") {
            const pending = markdownRenderer.flush();
            if (pending) {
              process.stdout.write(pending + "\n");
            }
            // Show errors
            process.stdout.write(chalk.red(`\nError: ${event.data}\n`));
          } else if (event.type === "done") {
            const pending = markdownRenderer.flush();
            if (pending) {
              process.stdout.write(pending);
            }
          }
        }
      });

      // Stop spinner if still running (e.g. at the end)
      if (spinner.isSpinning) {
        spinner.stop();
      }

      // Final newline
      if (options.stream !== false) {
        console.log();
      } else {
        // Non-streaming mode: show full render at the end
        console.log(display.render());
      }

      const statusText = statusLine.render();
      if (statusText) {
        console.log(statusText);
      }
    } catch (error) {
      if (spinner.isSpinning) {
        spinner.stop();
      }
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  async function handleInput(input: string): Promise<void> {
    if (questionnaireState) {
      await handleQuestionnaireInput(input);
      return;
    }

    if (pendingSelection) {
      // User pressed Enter to select a menu item
      const completion = pendingSelection;
      pendingSelection = null;

      // Move cursor up to overwrite the line where Enter was pressed
      process.stdout.write("\x1b[1A");

      // Show the completed command in the prompt
      showPrompt();

      ignoreKeypress = true;
      rl.write(completion + " ");
      ignoreKeypress = false;
      return;
    }

    if (!input.trim()) {
      showNextPrompt();
      return;
    }

    // Handle slash commands
    if (input.startsWith("/")) {
      await handleSlashCommand(input);
      showNextPrompt();
      return;
    }

    await runAgentWithInput(input);
    showNextPrompt();
  }

  async function handleSlashCommand(input: string): Promise<void> {
    await runtime.handleSlashCommand(input, async () => {
      isRunning = false;
      rl.close();
    });
  }

  // Welcome message
  const version = options.version || "0.0.0";
  console.log(chalk.cyan.bold(`Kigo v${version}`));
  console.log(chalk.dim("AI coding assistant for the terminal"));
  console.log(chalk.dim("Type /help for available commands\n"));

  showNextPrompt();

  // Cleanup on exit
  const cleanup = async () => {
    await runtime.close();
  };

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });

  // Main loop
  for await (const line of rl) {
    await handleInput(line);
  }
}
