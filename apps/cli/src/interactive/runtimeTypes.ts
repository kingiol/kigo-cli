import type { SlashCommandRegistry } from "../commands/slash/Registry.js";
import type { StatusLine } from "../display/StatusLine.js";

export interface InteractiveOptions {
  session?: string;
  stream?: boolean;
  model?: string;
  version?: string;
}

export type AnswerQuestionsPayload = {
  type: "questionnaire";
  questionnaireId: string;
  title?: string;
  instructions?: string;
  questions: Array<{
    id: string;
    text: string;
    options: string[];
    allowCustom?: boolean;
    customLabel?: string;
  }>;
};

export type RuntimeEvent = {
  type: "text_delta" | "tool_call" | "tool_output" | "done" | "error";
  data: any;
  toolName?: string;
  toolArgs?: any;
  questionnaire?: AnswerQuestionsPayload | null;
};

export type InteractiveRuntime = {
  runInput: (input: string, onEvent: (event: RuntimeEvent) => void) => Promise<void>;
  handleSlashCommand: (input: string, extraCleanup?: () => Promise<void>) => Promise<void>;
  close: () => Promise<void>;
  getStatusLine: () => StatusLine;
  getSessionId: () => string;
  getSlashRegistry: () => SlashCommandRegistry;
  isPlanModeEnabled: () => boolean;
  setPlanModeEnabled: (enabled: boolean) => void;
};

export function parseAnswerQuestionsPayload(
  result: any
): AnswerQuestionsPayload | null {
  const raw = typeof result === "string" ? result : JSON.stringify(result);
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.type === "questionnaire" &&
      parsed.questionnaireId &&
      Array.isArray(parsed.questions)
    ) {
      return parsed as AnswerQuestionsPayload;
    }
  } catch {
    return null;
  }
  return null;
}
