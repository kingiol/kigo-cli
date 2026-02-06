import { registry } from "@kigo/tools";
import { getConfigManager } from "../config/ConfigManager.js";
import {
  createInteractiveRuntime,
  type AnswerQuestionsPayload,
  type InteractiveOptions,
  type InteractiveRuntime,
  type RuntimeEvent,
} from "../interactive/runtime.js";
import { ToolRenderer } from "../display/ToolRenderer.js";

type OutputSection = {
  id: number;
  type: "text" | "tool_call" | "tool_output";
  content: string;
};

type ToolOutputState = {
  sectionId: number;
  lines: string[];
  offset: number;
};

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

type ReactModule = typeof import("react");
type InkModule = typeof import("ink");
type InkTextInputModule = typeof import("ink-text-input");

const ANSI_ESCAPE = "\u001b";
const ANSI_PATTERN = new RegExp(`${ANSI_ESCAPE}\\[[0-9;]*m`, "g");

function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, "");
}

function renderToolCallPlain(name: string, args: any): string {
  return stripAnsi(ToolRenderer.renderToolCall(name, args));
}

function renderToolOutputPlain(name: string, result: any): string {
  return stripAnsi(ToolRenderer.renderToolOutput(name, result));
}

function buildQuestionnaireState(payload: AnswerQuestionsPayload): QuestionnaireState {
  return {
    questionnaireId: payload.questionnaireId,
    questions: payload.questions.map((q) => ({
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
}

const MAX_TOOL_OUTPUT_LINES = 10;

type InteractiveInkAppProps = {
  configManager: Awaited<ReturnType<typeof getConfigManager>>;
  options: InteractiveOptions;
  react: ReactModule;
  ink: InkModule;
  textInput: InkTextInputModule["default"];
};

function InteractiveInkApp({
  configManager,
  options,
  react,
  ink,
  textInput: TextInput,
}: InteractiveInkAppProps): ReturnType<ReactModule["createElement"]> {
  const { useCallback, useEffect, useMemo, useRef, useState, createElement: h } = react;
  const { Box, Text, useApp, useInput } = ink;

  const { exit } = useApp();
  const runtimeRef = useRef<InteractiveRuntime | null>(null);

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [spinnerText, setSpinnerText] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [sections, setSections] = useState<OutputSection[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [isPlanMode, setIsPlanMode] = useState(false);
  const [questionnaireState, setQuestionnaireState] = useState<QuestionnaireState | null>(null);
  const [questionnaireIntro, setQuestionnaireIntro] =
    useState<{ title?: string; instructions?: string } | null>(null);
  const [toolOutputs, setToolOutputs] = useState<ToolOutputState[]>([]);
  const [activeToolOutputId, setActiveToolOutputId] = useState<number | null>(null);
  const [menuActive, setMenuActive] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const slashRegistry = runtimeRef.current?.getSlashRegistry();

  const suggestions = useMemo(() => {
    if (!slashRegistry || !inputValue.startsWith("/")) {
      return [];
    }
    return slashRegistry
      .getAll()
      .filter((c) => ("/" + c.name).startsWith(inputValue))
      .map((c) => ({ name: c.name, description: c.description }));
  }, [inputValue, slashRegistry]);

  useEffect(() => {
    if (suggestions.length === 0) {
      setMenuActive(false);
      setSelectedIndex(0);
      return;
    }
    setMenuActive(true);
    if (selectedIndex >= suggestions.length) {
      setSelectedIndex(0);
    }
  }, [suggestions, selectedIndex]);

  const appendSection = useCallback((type: OutputSection["type"], content: string) => {
    setSections((prev) => {
      const nextId = prev.length + 1;
      const next = [...prev, { id: nextId, type, content }];
      if (type === "tool_output") {
        const lines = content.split("\n");
        setToolOutputs((outputs) => [
          ...outputs,
          { sectionId: nextId, lines, offset: 0 },
        ]);
        setActiveToolOutputId(nextId);
      }
      return next;
    });
  }, []);


  const flushCurrentText = useCallback(() => {
    setCurrentText((text) => {
      if (!text) {
        return text;
      }
      appendSection("text", text);
      return "";
    });
  }, [appendSection]);

  const handleRuntimeEvent = useCallback(
    (event: RuntimeEvent) => {
      if (
        event.type === "tool_output" &&
        event.questionnaire &&
        !event.data.error
      ) {
        setQuestionnaireState(buildQuestionnaireState(event.questionnaire));
        setQuestionnaireIntro({
          title: event.questionnaire.title,
          instructions: event.questionnaire.instructions,
        });
      }

      if (event.type === "text_delta") {
        setCurrentText((text) => text + event.data);
        return;
      }

      if (event.type === "tool_call") {
        flushCurrentText();
        appendSection(
          "tool_call",
          renderToolCallPlain(event.toolName || "tool", event.toolArgs || {})
        );
        setSpinnerText("Executing...");
        return;
      }

      if (event.type === "tool_output") {
        flushCurrentText();
        if (event.questionnaire) {
          appendSection("tool_output", "已收到问卷，请按顺序回答。");
        } else if (event.data.error) {
          appendSection("tool_output", `Error: ${event.data.error}`);
        } else {
          appendSection(
            "tool_output",
            renderToolOutputPlain(event.toolName || "tool", event.data.result)
          );
        }
        setSpinnerText("Thinking...");
        return;
      }

      if (event.type === "error") {
        flushCurrentText();
        appendSection("text", `Error: ${event.data}`);
        return;
      }

      if (event.type === "done") {
        flushCurrentText();
        setSpinnerText("");
      }
    },
    [appendSection, flushCurrentText]
  );

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      const runtime = await createInteractiveRuntime(configManager, options);
      if (!mounted) {
        await runtime.close();
        return;
      }
      runtimeRef.current = runtime;
      setStatusText(runtime.getStatusLine().render());
      setIsPlanMode(runtime.isPlanModeEnabled());
      setReady(true);
    };

    void initialize();

    return () => {
      mounted = false;
      if (runtimeRef.current) {
        void runtimeRef.current.close();
      }
    };
  }, [configManager, options]);

  const submitQuestionnaireAnswers = useCallback(
    async (state: QuestionnaireState) => {
      const tool = registry.get("answer_questions");
      if (!tool) {
        appendSection("text", "Error: answer_questions tool not available.");
        setQuestionnaireState(null);
        return;
      }

      const env = process.env;
      const runtime = runtimeRef.current;
      if (!runtime) {
        return;
      }
      const prevSession = env.KIGO_SESSION_ID;
      env.KIGO_SESSION_ID = runtime.getSessionId();
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

      setQuestionnaireState(null);
      const prevSuppress = process.env.KIGO_SUPPRESS_QUESTIONNAIRE_ASK;
      process.env.KIGO_SUPPRESS_QUESTIONNAIRE_ASK = "1";
      try {
        await runtime.runInput(
          [
            "问卷已完成。请基于以下回答继续，不要再次创建问卷，除非用户明确要求补充信息。",
            "问卷回答如下：",
            result,
          ].join("\n"),
          handleRuntimeEvent
        );
      } finally {
        if (prevSuppress === undefined) {
          delete process.env.KIGO_SUPPRESS_QUESTIONNAIRE_ASK;
        } else {
          process.env.KIGO_SUPPRESS_QUESTIONNAIRE_ASK = prevSuppress;
        }
      }
      setStatusText(runtime.getStatusLine().render());
      setIsPlanMode(runtime.isPlanModeEnabled());
    },
    [appendSection, handleRuntimeEvent]
  );

  const handleQuestionnaireInput = useCallback(
    async (input: string) => {
      const state = questionnaireState;
      if (!state) {
        return;
      }
      const trimmed = input.trim();
      const question = state.questions[state.currentIndex];
      if (!question) {
        setQuestionnaireState(null);
        return;
      }
      const optionCount = question.options.length;
      const customIndex = question.allowCustom ? optionCount + 1 : null;
      const maxSelection = customIndex ?? optionCount;

      if (state.awaitingCustom) {
        if (!trimmed) {
          appendSection("text", "请输入自定义答案，不能为空。");
          return;
        }
        const nextState: QuestionnaireState = {
          ...state,
          answers: [
            ...state.answers,
            { questionId: question.id, customAnswer: trimmed },
          ],
          awaitingCustom: false,
          currentIndex: state.currentIndex + 1,
        };
        if (nextState.currentIndex >= nextState.questions.length) {
          await submitQuestionnaireAnswers(nextState);
          return;
        }
        setQuestionnaireState(nextState);
        return;
      }

      const selection = Number.parseInt(trimmed, 10);
      if (Number.isNaN(selection)) {
        appendSection("text", `请输入 1-${maxSelection} 之间的数字。`);
        return;
      }

      if (selection >= 1 && selection <= optionCount) {
        const nextState: QuestionnaireState = {
          ...state,
          answers: [
            ...state.answers,
            { questionId: question.id, selectedIndex: selection },
          ],
          currentIndex: state.currentIndex + 1,
        };
        if (nextState.currentIndex >= nextState.questions.length) {
          await submitQuestionnaireAnswers(nextState);
          return;
        }
        setQuestionnaireState(nextState);
        return;
      }

      if (customIndex && selection === customIndex) {
        if (!question.allowCustom) {
          appendSection("text", `该问题不支持自定义答案，请选择 1-${optionCount}。`);
          return;
        }
        setQuestionnaireState({ ...state, awaitingCustom: true });
        return;
      }

      appendSection("text", `请输入 1-${maxSelection} 之间的数字。`);
    },
    [appendSection, questionnaireState, submitQuestionnaireAnswers]
  );

  const adjustActiveToolOutput = useCallback(
    (delta: number) => {
      setToolOutputs((outputs) => {
        if (!activeToolOutputId) {
          return outputs;
        }
        const next = outputs.map((output) => {
          if (output.sectionId !== activeToolOutputId) {
            return output;
          }
          const maxOffset = Math.max(0, output.lines.length - MAX_TOOL_OUTPUT_LINES);
          const nextOffset = Math.min(
            maxOffset,
            Math.max(0, output.offset + delta)
          );
          return { ...output, offset: nextOffset };
        });
        return next;
      });
    },
    [activeToolOutputId]
  );

  const cycleToolOutput = useCallback(
    (direction: 1 | -1) => {
      setToolOutputs((outputs) => {
        if (outputs.length === 0) {
          return outputs;
        }
        const ids = outputs.map((o) => o.sectionId);
        const currentIndex = activeToolOutputId
          ? ids.indexOf(activeToolOutputId)
          : -1;
        const nextIndex =
          currentIndex === -1
            ? ids.length - 1
            : (currentIndex + direction + ids.length) % ids.length;
        setActiveToolOutputId(ids[nextIndex]);
        return outputs;
      });
    },
    [activeToolOutputId]
  );

  const handleSubmit = useCallback(
    async (value: string) => {
      if (!ready || busy) {
        return;
      }
      const trimmed = value.trim();
      const runtime = runtimeRef.current;

      if (value.startsWith("/") && slashRegistry) {
        const matches = slashRegistry
          .getAll()
          .filter((c) => ("/" + c.name).startsWith(value));
        if (matches.length > 0) {
          const selected = matches[selectedIndex] || matches[0];
          const command = `/${selected.name}`;
          setInputValue("");
          appendSection("text", `> ${command}`);
          const logs: string[] = [];
          const original = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error,
          };
          const capture = (...args: any[]) => {
            logs.push(args.map((arg) => String(arg)).join(" "));
          };
          console.log = capture;
          console.info = capture;
          console.warn = capture;
          console.error = capture;
          try {
            await runtime.handleSlashCommand(command, async () => {
              exit();
            });
          } finally {
            console.log = original.log;
            console.info = original.info;
            console.warn = original.warn;
            console.error = original.error;
          }
          if (logs.length > 0) {
            appendSection("text", logs.join("\n"));
          }
          setStatusText(runtime.getStatusLine().render());
          setIsPlanMode(runtime.isPlanModeEnabled());
          return;
        }
      }

      setInputValue("");

      if (!trimmed) {
        return;
      }

      if (questionnaireState) {
        flushCurrentText();
        appendSection("text", `> ${trimmed}`);
        await handleQuestionnaireInput(trimmed);
        return;
      }
      if (!runtime) {
        return;
      }

      if (trimmed.startsWith("/")) {
        const logs: string[] = [];
        const original = {
          log: console.log,
          info: console.info,
          warn: console.warn,
          error: console.error,
        };
        const capture = (...args: any[]) => {
          logs.push(args.map((arg) => String(arg)).join(" "));
        };
        console.log = capture;
        console.info = capture;
        console.warn = capture;
        console.error = capture;
        try {
          await runtime.handleSlashCommand(trimmed, async () => {
            exit();
          });
        } finally {
          console.log = original.log;
          console.info = original.info;
          console.warn = original.warn;
          console.error = original.error;
        }
        appendSection("text", `> ${trimmed}`);
        if (logs.length > 0) {
          appendSection("text", logs.join("\n"));
        }
        setStatusText(runtime.getStatusLine().render());
        setIsPlanMode(runtime.isPlanModeEnabled());
        return;
      }

      flushCurrentText();
      appendSection("text", `> ${trimmed}`);

      setBusy(true);
      setSpinnerText("Thinking...");
      await runtime.runInput(trimmed, handleRuntimeEvent);
      setBusy(false);
      setSpinnerText("");
      setStatusText(runtime.getStatusLine().render());
      setIsPlanMode(runtime.isPlanModeEnabled());
    },
    [
      busy,
      exit,
      handleQuestionnaireInput,
      handleRuntimeEvent,
      questionnaireState,
      ready,
    ]
  );

  useInput((input, key) => {
    const runtime = runtimeRef.current;
    const isShiftTab =
      input === "\u001b[Z" ||
      (key.tab && (key as { shift?: boolean }).shift === true);
    if (isShiftTab && runtime && !busy) {
      const next = !runtime.isPlanModeEnabled();
      runtime.setPlanModeEnabled(next);
      setIsPlanMode(next);
      setStatusText(runtime.getStatusLine().render());
      return;
    }

    if (key.escape && questionnaireState) {
      setQuestionnaireState(null);
      return;
    }
    if (menuActive && suggestions.length > 0) {
      if (key.upArrow) {
        setSelectedIndex((prev) =>
          (prev - 1 + suggestions.length) % suggestions.length
        );
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (key.tab) {
        const selected = suggestions[selectedIndex];
        if (selected) {
          setInputValue(`/${selected.name} `);
        }
        return;
      }
    }
    if (key.ctrl && key.upArrow) {
      cycleToolOutput(-1);
      return;
    }
    if (key.ctrl && key.downArrow) {
      cycleToolOutput(1);
      return;
    }
    if (key.pageUp) {
      adjustActiveToolOutput(-MAX_TOOL_OUTPUT_LINES);
      return;
    }
    if (key.pageDown) {
      adjustActiveToolOutput(MAX_TOOL_OUTPUT_LINES);
      return;
    }
    if (key.upArrow) {
      adjustActiveToolOutput(-1);
      return;
    }
    if (key.downArrow) {
      adjustActiveToolOutput(1);
      return;
    }
  });

  const promptLabel = useMemo(() => {
    if (questionnaireState) {
      if (questionnaireState.awaitingCustom) {
        return "自定义答案> ";
      }
      const question = questionnaireState.questions[questionnaireState.currentIndex];
      if (!question) {
        return "回答> ";
      }
      const maxSelection = question.allowCustom
        ? question.options.length + 1
        : question.options.length;
      return `回答(1-${maxSelection})> `;
    }
    return "> ";
  }, [questionnaireState]);

  const currentQuestion = questionnaireState
    ? questionnaireState.questions[questionnaireState.currentIndex]
    : null;

  const toolOutputMap = useMemo(() => {
    const map = new Map<number, ToolOutputState>();
    for (const output of toolOutputs) {
      map.set(output.sectionId, output);
    }
    return map;
  }, [toolOutputs]);

  return h(
    Box,
    { flexDirection: "column", padding: 1 },
    h(
      Text,
      { color: "cyan", bold: true },
      `Kigo v${options.version || "0.0.0"}`
    ),
    h(Text, { dimColor: true }, "AI coding assistant for the terminal"),
    h(Text, { dimColor: true }, "Type /help for available commands"),
    h(Text, {}, " "),
    h(
      Box,
      { flexDirection: "column" },
      ...sections.map((section) => {
        if (section.type !== "tool_output") {
          return h(Text, { key: section.id }, section.content);
        }
        const toolState = toolOutputMap.get(section.id);
        if (!toolState) {
          return h(Text, { key: section.id }, section.content);
        }
        const start = toolState.offset;
        const end = start + MAX_TOOL_OUTPUT_LINES;
        const visibleLines = toolState.lines.slice(start, end);
        const remaining = toolState.lines.length - end;
        const header =
          section.id === activeToolOutputId
            ? "─ tool output (active)"
            : "─ tool output";
        const footer =
          toolState.lines.length > MAX_TOOL_OUTPUT_LINES
            ? `… ${Math.max(0, remaining)} more lines (↑↓ PgUp/PgDn, Ctrl+↑/↓ to switch)`
            : null;
        return h(
          Box,
          { key: section.id, flexDirection: "column" },
          h(Text, { dimColor: true }, header),
          ...visibleLines.map((line, index) =>
            h(Text, { key: `${section.id}-${index}` }, line)
          ),
          footer ? h(Text, { dimColor: true }, footer) : null
        );
      }),
      currentText ? h(Text, {}, currentText) : null
    ),
    questionnaireIntro
      ? h(
          Box,
          { flexDirection: "column", marginTop: 1 },
          questionnaireIntro.title
            ? h(Text, { color: "cyan", bold: true }, questionnaireIntro.title)
            : null,
          questionnaireIntro.instructions
            ? h(Text, { dimColor: true }, questionnaireIntro.instructions)
            : null
        )
      : null,
    currentQuestion
      ? h(
          Box,
          { flexDirection: "column", marginTop: 1 },
          h(
            Text,
            { color: "cyan" },
            `问题 ${questionnaireState!.currentIndex + 1}/${
              questionnaireState!.questions.length
            }: ${currentQuestion.text}`
          ),
          ...currentQuestion.options.map((option, index) =>
            h(Text, { key: `${option}-${index}` }, `  ${index + 1}) ${option}`)
          ),
          currentQuestion.allowCustom
            ? h(
                Text,
                {},
                `  ${currentQuestion.options.length + 1}) ${currentQuestion.customLabel}`
              )
            : null
        )
      : null,
    busy && spinnerText
      ? h(
          Box,
          { marginTop: 1 },
          h(Text, { color: "cyan" }, spinnerText)
        )
      : null,
    statusText
      ? h(
          Box,
          { marginTop: 1 },
          h(Text, { dimColor: true }, statusText)
        )
      : null,
    h(
      Box,
      { marginTop: 1 },
      h(Text, { color: "blue" }, promptLabel),
      h(TextInput, {
        value: inputValue,
        onChange: setInputValue,
        onSubmit: handleSubmit,
        focus: ready && !busy,
      })
    ),
    h(
      Text,
      { color: isPlanMode ? "yellow" : "green", bold: true },
      `MODE: ${isPlanMode ? "PLAN" : "AGENT"}  |  Shift+Tab to toggle`
    ),
    suggestions.length > 0
      ? h(
          Box,
          { flexDirection: "column", marginTop: 1 },
          ...suggestions.map((item, index) =>
            h(
              Text,
              {
                key: `${item.name}-${index}`,
                dimColor: index !== selectedIndex,
                bold: index === selectedIndex,
              },
              index === selectedIndex
                ? `> /${item.name} - ${item.description}`
                : `  /${item.name} - ${item.description}`
            )
          )
        )
      : null
  );
}

export async function runInteractiveInk(
  configManager: Awaited<ReturnType<typeof getConfigManager>>,
  options: InteractiveOptions
): Promise<void> {
  const react = (await import("react")) as ReactModule;
  const ink = (await import("ink")) as InkModule;
  const textInput = ((await import("ink-text-input")) as InkTextInputModule)
    .default;

  const { createElement: h } = react;
  const app = ink.render(
    h(InteractiveInkApp, {
      configManager,
      options,
      react,
      ink,
      textInput,
    })
  );
  await app.waitUntilExit();
}
