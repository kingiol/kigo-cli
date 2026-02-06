import { z } from "zod";
import { tool, registry } from "../registry.js";

const askOptionSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
});

export const askUserQuestionSchema = z.object({
  header: z.string().max(12).optional(),
  question: z.string().min(1),
  options: z.array(askOptionSchema).min(2).max(5),
  allowOther: z.boolean().default(true),
});

tool({
  name: "ask_user_question",
  description:
    "Ask user a single structured question with 2-5 options, and optionally allow custom answer.",
  schema: askUserQuestionSchema,
  execute: async ({ header, question, options, allowOther }) => {
    const answerTool = registry.get("answer_questions");
    if (!answerTool) {
      throw new Error("answer_questions tool not available");
    }

    return answerTool.execute({
      mode: "ask",
      title: header || "Question",
      instructions: "Please choose one option or provide a custom answer.",
      questions: [
        {
          id: "q1",
          text: question,
          options: options.map((option) => option.label),
          allowCustom: allowOther,
          customLabel: "Other",
        },
      ],
    });
  },
});
