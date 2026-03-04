import type { Tool } from "../types.js";

export type AgentMode = "primary" | "subagent" | "all";

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  mode: AgentMode;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  steps?: number;
  readOnly?: boolean;
  allowedTools?: string[];
  blockedTools?: string[];
}

export interface AgentProfileOverride {
  name?: string;
  description?: string;
  mode?: AgentMode;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  steps?: number;
  readOnly?: boolean;
  allowedTools?: string[];
  blockedTools?: string[];
  disable?: boolean;
}

export type AgentProfileOverrides = Record<string, AgentProfileOverride>;

const DEFAULT_PLAN_ALLOWED_TOOLS = [
  "read_file",
  "list_directory",
  "glob_search",
  "grep_search",
  "codesearch",
  "web_search",
  "web_fetch",
  "todo_read",
  "shell_output",
  "answer_questions",
  "ask_user_question",
  "get_skill",
  "task_output",
];

function defaultProfiles(): AgentProfile[] {
  return [
    {
      id: "build",
      name: "build",
      description: "Default full-access execution agent.",
      mode: "primary",
      readOnly: false,
    },
    {
      id: "plan",
      name: "plan",
      description: "Read-only planning agent.",
      mode: "primary",
      readOnly: true,
      allowedTools: DEFAULT_PLAN_ALLOWED_TOOLS,
    },
    {
      id: "general",
      name: "general",
      description: "General-purpose sub-agent for multi-step work.",
      mode: "subagent",
      readOnly: false,
    },
    {
      id: "explore",
      name: "explore",
      description: "Fast sub-agent specialized for codebase exploration.",
      mode: "subagent",
      readOnly: true,
      allowedTools: [
        "read_file",
        "list_directory",
        "glob_search",
        "grep_search",
        "codesearch",
        "web_search",
        "web_fetch",
        "shell_output",
        "run_shell",
        "task_output",
      ],
      blockedTools: ["write_file", "edit_file"],
    },
  ];
}

export class AgentRegistry {
  private readonly profiles: Map<string, AgentProfile> = new Map();

  constructor(overrides: AgentProfileOverrides = {}) {
    for (const profile of defaultProfiles()) {
      this.profiles.set(profile.id, profile);
    }

    for (const [id, override] of Object.entries(overrides)) {
      if (override.disable) {
        this.profiles.delete(id);
        continue;
      }

      const existing = this.profiles.get(id);
      if (!existing) {
        this.profiles.set(id, {
          id,
          name: override.name || id,
          description: override.description || "",
          mode: override.mode || "all",
          systemPrompt: override.systemPrompt,
          model: override.model,
          temperature: override.temperature,
          maxTokens: override.maxTokens,
          steps: override.steps,
          readOnly: override.readOnly,
          allowedTools: override.allowedTools,
          blockedTools: override.blockedTools,
        });
        continue;
      }

      this.profiles.set(id, {
        ...existing,
        ...override,
      });
    }
  }

  get(id: string): AgentProfile | undefined {
    return this.profiles.get(id);
  }

  list(): AgentProfile[] {
    return Array.from(this.profiles.values());
  }

  listByMode(mode: AgentMode): AgentProfile[] {
    return this.list().filter((profile) => profile.mode === mode || profile.mode === "all");
  }

  has(id: string): boolean {
    return this.profiles.has(id);
  }
}

export function filterToolsForAgent(tools: Tool[], profile: AgentProfile): Tool[] {
  return tools.filter((tool) => {
    if (profile.blockedTools?.some((pattern) => matchesPattern(tool.name, pattern))) {
      return false;
    }
    if (profile.allowedTools && profile.allowedTools.length > 0) {
      return profile.allowedTools.some((pattern) => matchesPattern(tool.name, pattern));
    }
    return true;
  });
}

function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}
