/**
 * Answer questions tool
 */

import { z } from "zod";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { tool } from "../registry.js";

type StoredQuestionnaire = {
  id: string;
  title?: string;
  instructions?: string;
  questions: Array<{
    id: string;
    text: string;
    options: string[];
    allowCustom: boolean;
    customLabel: string;
  }>;
  createdAt: number;
};

type StoredSessionData = {
  questionnaires: Record<string, StoredQuestionnaire>;
};

const ANSWER_DIR = path.join(os.homedir(), ".kigo", "answer-questions");

function getSessionId(): string {
  return process.env.KIGO_SESSION_ID || "session_default";
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getSessionFile(): string {
  const sessionId = sanitizeId(getSessionId());
  return path.join(ANSWER_DIR, `${sessionId}.json`);
}

async function ensureAnswerDir(): Promise<void> {
  await fs.mkdir(ANSWER_DIR, { recursive: true });
}

async function loadSessionData(): Promise<StoredSessionData> {
  const file = getSessionFile();
  try {
    const content = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && parsed.questionnaires) {
      return parsed as StoredSessionData;
    }
  } catch {
    // ignore
  }
  return { questionnaires: {} };
}

async function saveSessionData(data: StoredSessionData): Promise<void> {
  await ensureAnswerDir();
  await fs.writeFile(getSessionFile(), JSON.stringify(data, null, 2), "utf-8");
}

const questionSchema = z.object({
  id: z.string().optional().describe("Optional question id"),
  text: z.string().min(1).describe("Question text"),
  options: z
    .array(z.string().min(1))
    .min(1)
    .max(10)
    .describe("Up to 10 options (will be normalized to max 5 + custom)"),
  allowCustom: z.boolean().optional().default(true),
  customLabel: z.string().optional().describe("Label for the custom option"),
});

const answerItemSchema = z
  .object({
    questionId: z.string(),
    selectedIndex: z.number().int().min(1).max(5).optional(),
    selectedOption: z.string().optional(),
    customAnswer: z.string().optional(),
  })
  .refine(
    (value) =>
      value.selectedIndex || value.selectedOption || value.customAnswer,
    "Provide selectedIndex, selectedOption, or customAnswer",
  );

export const answerQuestionsSchema = z
  .object({
    mode: z.enum(["ask", "submit"]),
    title: z.string().optional(),
    instructions: z.string().optional(),
    questions: z.array(questionSchema).optional(),
    questionnaireId: z.string().optional(),
    answers: z.array(answerItemSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "ask") {
      if (!value.questions || value.questions.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "questions is required when mode is ask",
          path: ["questions"],
        });
      }
      return;
    }

    if (!value.questionnaireId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "questionnaireId is required when mode is submit",
        path: ["questionnaireId"],
      });
    }

    if (!value.answers || value.answers.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "answers is required when mode is submit",
        path: ["answers"],
      });
    }
  });

const CUSTOM_OPTION_KEYWORDS = ["自定义", "其他", "其它", "other", "custom"];

function isCustomOptionLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return CUSTOM_OPTION_KEYWORDS.some((keyword) =>
    normalized.includes(keyword),
  );
}

function normalizeQuestionInput(question: {
  options: string[];
  allowCustom?: boolean;
  customLabel?: string;
}): { options: string[]; allowCustom: boolean; customLabel: string } {
  const options = [...question.options];
  let allowCustom = question.allowCustom ?? true;
  let customLabel = question.customLabel?.trim() || "自定义";

  const customIndex = options.findIndex((option) => isCustomOptionLabel(option));
  if (customIndex >= 0) {
    customLabel = options[customIndex].trim() || customLabel;
    allowCustom = true;
    options.splice(customIndex, 1);
  }

  if (options.length > 5) {
    if (allowCustom && customIndex === -1) {
      customLabel = options[options.length - 1].trim() || customLabel;
    }
    options.splice(5);
  }

  return { options, allowCustom, customLabel };
}

function formatPrompt(questionnaire: StoredQuestionnaire): string {
  const lines: string[] = [];
  if (questionnaire.title) {
    lines.push(questionnaire.title);
    lines.push("");
  }
  lines.push(
    questionnaire.instructions ||
      "请回答以下问题。每题请选择一个选项编号，或选择“自定义”输入你的答案。",
  );
  lines.push("");
  questionnaire.questions.forEach((question, index) => {
    lines.push(`${index + 1}. ${question.text}`);
    question.options.forEach((option, optionIndex) => {
      lines.push(`   ${optionIndex + 1}) ${option}`);
    });
    if (question.allowCustom) {
      lines.push(`   6) ${question.customLabel || "自定义"}`);
    }
    lines.push("");
  });
  return lines.join("\n").trim();
}

tool({
  name: "answer_questions",
  description:
    "Ask a set of multiple-choice questions (up to 5 options each) with an optional custom answer, and collect responses.",
  schema: answerQuestionsSchema,
  execute: async (params) => {
    if (
      params.mode === "ask" &&
      process.env.KIGO_SUPPRESS_QUESTIONNAIRE_ASK === "1"
    ) {
      return JSON.stringify(
        {
          type: "questionnaire_blocked",
          reason:
            "Questionnaire creation is temporarily blocked. Use the existing answers unless the user explicitly asks to re-run the questionnaire.",
        },
        null,
        2,
      );
    }

    if (params.mode === "ask") {
      if (!params.questions || params.questions.length === 0) {
        throw new Error("questions is required when mode is ask");
      }

      const data = await loadSessionData();
      const questionnaireId = `q_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      const questions = params.questions.map((question, index) => {
        const normalized = normalizeQuestionInput(question);
        return {
          id: question.id || `q${index + 1}`,
          text: question.text,
          options: normalized.options,
          allowCustom: normalized.allowCustom,
          customLabel: normalized.customLabel,
        };
      });

      const questionnaire: StoredQuestionnaire = {
        id: questionnaireId,
        title: params.title,
        instructions: params.instructions,
        questions,
        createdAt: Date.now(),
      };

      data.questionnaires[questionnaireId] = questionnaire;
      await saveSessionData(data);

      const payload = {
        type: "questionnaire",
        questionnaireId,
        title: questionnaire.title,
        instructions: questionnaire.instructions,
        questions: questionnaire.questions,
        prompt: formatPrompt(questionnaire),
        responseFormat: {
          mode: "submit",
          questionnaireId,
          answers: questionnaire.questions.map((question) => ({
            questionId: question.id,
            selectedIndex: 1,
            customAnswer: "",
          })),
        },
      };

      return JSON.stringify(payload, null, 2);
    }

    if (!params.questionnaireId) {
      throw new Error("questionnaireId is required when mode is submit");
    }

    if (!params.answers || params.answers.length === 0) {
      throw new Error("answers is required when mode is submit");
    }

    const data = await loadSessionData();
    const questionnaire = data.questionnaires[params.questionnaireId];
    if (!questionnaire) {
      return `Questionnaire not found: ${params.questionnaireId}`;
    }

    const answerMap = new Map(
      params.answers.map((answer) => [answer.questionId, answer]),
    );
    const missing = questionnaire.questions
      .filter((question) => !answerMap.has(question.id))
      .map((question) => question.id);

    if (missing.length > 0) {
      return `Missing answers for questions: ${missing.join(", ")}`;
    }

    const resolved = questionnaire.questions.map((question) => {
      const answer = answerMap.get(question.id)!;
      let resolvedAnswer = "";
      let source: "option" | "custom" = "option";
      let optionIndex: number | undefined;

      if (answer.customAnswer) {
        if (!question.allowCustom) {
          return {
            questionId: question.id,
            question: question.text,
            error: "Custom answers are not allowed for this question.",
          };
        }
        resolvedAnswer = answer.customAnswer;
        source = "custom";
      } else if (answer.selectedIndex) {
        const index = answer.selectedIndex - 1;
        resolvedAnswer = question.options[index] || "";
        optionIndex = answer.selectedIndex;
      } else if (answer.selectedOption) {
        resolvedAnswer = answer.selectedOption;
      }

      if (!resolvedAnswer) {
        return {
          questionId: question.id,
          question: question.text,
          error: "Invalid answer selection.",
        };
      }

      return {
        questionId: question.id,
        question: question.text,
        answer: resolvedAnswer,
        source,
        optionIndex,
      };
    });

    const payload = {
      type: "answers",
      questionnaireId: questionnaire.id,
      title: questionnaire.title,
      answers: resolved,
    };

    return JSON.stringify(payload, null, 2);
  },
});
