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

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

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
  const [questionnaireState, setQuestionnaireState] = useState<QuestionnaireState | null>(null);
  const [questionnaireIntro, setQuestionnaireIntro] =
    useState<{ title?: string; instructions?: string } | null>(null);

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

  const appendSection = useCallback((type: OutputSection["type"], content: string) => {
    setSections((prev) => [
      ...prev,
      { id: prev.length + 1, type, content },
    ]);
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
        event.toolName === "answer_questions" &&
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
        if (event.toolName === "answer_questions" && event.questionnaire) {
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

  const handleSubmit = useCallback(
    async (value: string) => {
      if (!ready || busy) {
        return;
      }
      const trimmed = value.trim();
      setInputValue("");

      if (!trimmed) {
        return;
      }

      flushCurrentText();
      appendSection("text", `> ${trimmed}`);

      if (questionnaireState) {
        await handleQuestionnaireInput(trimmed);
        return;
      }

      const runtime = runtimeRef.current;
      if (!runtime) {
        return;
      }

      if (trimmed.startsWith("/")) {
        await runtime.handleSlashCommand(trimmed, async () => {
          exit();
        });
        return;
      }

      setBusy(true);
      setSpinnerText("Thinking...");
      await runtime.runInput(trimmed, handleRuntimeEvent);
      setBusy(false);
      setSpinnerText("");
      setStatusText(runtime.getStatusLine().render());
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

  useInput((_input, key) => {
    if (key.escape && questionnaireState) {
      setQuestionnaireState(null);
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
      ...sections.map((section) => h(Text, { key: section.id }, section.content)),
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
    suggestions.length > 0
      ? h(
          Box,
          { flexDirection: "column", marginTop: 1 },
          ...suggestions.map((item) =>
            h(
              Text,
              { key: item.name, dimColor: true },
              `/${item.name} - ${item.description}`
            )
          )
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
    )
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
