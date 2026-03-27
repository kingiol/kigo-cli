import type { TaskCommandContext } from "../../types.js";
import { handleTaskExecutionAction } from "./executionHandlers.js";
import { handleTaskInteractionAction } from "./interactionHandlers.js";
import { handleTaskQueryAction } from "./queryHandlers.js";

export async function handleTaskAction(
  action: string,
  args: string[],
  context: TaskCommandContext,
): Promise<boolean> {
  if (await handleTaskQueryAction(action, args, context)) {
    return true;
  }
  if (await handleTaskExecutionAction(action, args, context)) {
    return true;
  }
  if (await handleTaskInteractionAction(action, args, context)) {
    return true;
  }
  return false;
}
