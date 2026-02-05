import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import yaml from 'js-yaml';
import { KigoConfigSchema, type KigoConfig, type MCPServerConfig } from '@kigo/config/schema';

type ConfigSummary = {
  path: string;
  model: string;
  provider: string;
};

type SaveState = {
  status: 'idle' | 'saving' | 'saved' | 'error';
  message?: string;
};

type MCPFormState = {
  name: string;
  transportType: 'stdio' | 'http' | 'sse';
  command: string;
  args: string;
  url: string;
  headers: string;
  envVars: string;
  allowedTools: string;
  blockedTools: string;
  cacheToolsList: boolean;
};

type AuthProviderSummary = {
  provider: string;
  email?: string;
  expiresAt?: number;
  expired?: boolean;
};

type SkillSummary = {
  name: string;
  description: string;
};

type SkillDetail = SkillSummary & {
  content: string;
  allowedTools?: string[];
  path: string;
};

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type ApprovalItem = {
  requestId: string;
  toolName: string;
  source: 'builtin' | 'mcp';
  params: string;
};

type AuditRecord = {
  sessionId: string;
  timestamp: number;
  type: 'tool_call' | 'tool_output' | 'approval_request' | 'approval_decision';
  data: unknown;
};

type SessionItem = {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};

export default function App() {
  const [configSummary, setConfigSummary] = useState<ConfigSummary | null>(null);
  const [config, setConfig] = useState<KigoConfig | null>(null);
  const [configPath, setConfigPath] = useState<string>('');
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [quickSetState, setQuickSetState] = useState<SaveState>({ status: 'idle' });
  const [quickKey, setQuickKey] = useState('');
  const [quickValue, setQuickValue] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mcpServers, setMcpServers] = useState<MCPServerConfig[]>([]);
  const [mcpState, setMcpState] = useState<SaveState>({ status: 'idle' });
  const [authProviders, setAuthProviders] = useState<AuthProviderSummary[]>([]);
  const [authState, setAuthState] = useState<SaveState>({ status: 'idle' });
  const [authProvider, setAuthProvider] = useState('google');
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [skillsState, setSkillsState] = useState<SaveState>({ status: 'idle' });
  const [selectedSkill, setSelectedSkill] = useState<SkillDetail | null>(null);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalItem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [sessionQuery, setSessionQuery] = useState('');
  const [sessionFilter, setSessionFilter] = useState<'all' | 'today' | 'week'>('all');
  const [sessionSort, setSessionSort] = useState<'updated' | 'created' | 'messages'>('updated');
  const [sessionSortDir, setSessionSortDir] = useState<'desc' | 'asc'>('desc');
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [showRawConfig, setShowRawConfig] = useState(false);
  const [auditFilters, setAuditFilters] = useState<Record<AuditRecord['type'], boolean>>({
    tool_call: true,
    tool_output: true,
    approval_request: true,
    approval_decision: true
  });

  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const sessionSearchRef = useRef<HTMLInputElement | null>(null);
  const [mcpForm, setMcpForm] = useState<MCPFormState>({
    name: '',
    transportType: 'stdio',
    command: '',
    args: '',
    url: '',
    headers: '',
    envVars: '',
    allowedTools: '',
    blockedTools: '',
    cacheToolsList: true
  });

  const refreshSessions = async () => {
    if (!window.kigo?.session) return;
    const result = await window.kigo.session.list();
    setSessions(result.sessions);
  };

  const filteredSessions = useMemo(() => {
    const query = sessionQuery.trim().toLowerCase();
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const withinDays = (timestamp: number, days: number) => now - timestamp <= days * dayMs;

    const filtered = sessions.filter((session) => {
      const matchesQuery =
        !query ||
        (session.title ?? '').toLowerCase().includes(query) ||
        session.id.toLowerCase().includes(query);

      if (!matchesQuery) return false;

      if (sessionFilter === 'today') {
        return withinDays(session.updatedAt, 1);
      }
      if (sessionFilter === 'week') {
        return withinDays(session.updatedAt, 7);
      }
      return true;
    });

    const getSortValue = (session: SessionItem) => {
      if (sessionSort === 'created') return session.createdAt;
      if (sessionSort === 'messages') return session.messageCount;
      return session.updatedAt;
    };

    const sorted = [...filtered].sort((a, b) => {
      const valueA = getSortValue(a);
      const valueB = getSortValue(b);
      if (valueA === valueB) return 0;
      const order = valueA > valueB ? 1 : -1;
      return sessionSortDir === 'desc' ? -order : order;
    });

    return sorted;
  }, [sessions, sessionQuery, sessionFilter, sessionSort, sessionSortDir]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!window.kigo?.config) return;
      const { config, path } = await window.kigo.config.get();
      if (!active) return;
      setConfig(config);
      setConfigPath(path);
      setMcpServers(config.mcpServers ?? []);
      setConfigSummary({
        path,
        model: config.model.name,
        provider: config.model.provider
      });
      if (window.kigo?.mcp) {
        const result = await window.kigo.mcp.list();
        if (!active) return;
        setMcpServers(result.servers);
      }
      if (window.kigo?.session) {
        const result = await window.kigo.session.list();
        if (!active) return;
        setSessions(result.sessions);
      }
      if (window.kigo?.auth) {
        const result = await window.kigo.auth.list();
        if (!active) return;
        setAuthProviders(result.providers);
      }
      if (window.kigo?.skills) {
        const result = await window.kigo.skills.list();
        if (!active) return;
        setSkills(result.skills);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!window.kigo?.chat) return;
    const unsubscribeEvents = window.kigo.chat.onEvent((payload) => {
      if (sessionId && payload.sessionId !== sessionId) return;
      const event = payload.event as { type?: string; data?: any };
      if (!event?.type) return;

      if (event.type === 'text_delta') {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (!last || last.role !== 'assistant') {
            next.push({ role: 'assistant', content: String(event.data ?? '') });
          } else {
            next[next.length - 1] = { ...last, content: last.content + String(event.data ?? '') };
          }
          return next;
        });
      }

      if (event.type === 'tool_call') {
        setAuditRecords((prev) => [
          ...prev,
          {
            sessionId: payload.sessionId,
            timestamp: Date.now(),
            type: 'tool_call',
            data: event.data
          }
        ]);
      }

      if (event.type === 'tool_output') {
        setAuditRecords((prev) => [
          ...prev,
          {
            sessionId: payload.sessionId,
            timestamp: Date.now(),
            type: 'tool_output',
            data: event.data
          }
        ]);
      }

      if (event.type === 'done') {
        setIsSending(false);
        void refreshSessions();
      }

      if (event.type === 'error') {
        setIsSending(false);
        setChatError(String(event.data ?? 'Unknown error'));
      }
    });

    const unsubscribeApprovals = window.kigo.chat.onApproval((payload) => {
      if (sessionId && payload.sessionId !== sessionId) return;
      if (!sessionId) setSessionId(payload.sessionId);
      setPendingApprovals((prev) => [
        ...prev,
        {
          requestId: payload.requestId,
          toolName: payload.tool.name,
          source: payload.tool.source,
          params: JSON.stringify(payload.tool.params, null, 2)
        }
      ]);
      setAuditRecords((prev) => [
        ...prev,
        {
          sessionId: payload.sessionId,
          timestamp: Date.now(),
          type: 'approval_request',
          data: payload
        }
      ]);
    });

    return () => {
      unsubscribeEvents();
      unsubscribeApprovals();
    };
  }, [sessionId]);

  const isReady = !!config;
  const mcpCount = useMemo(() => config?.mcpServers?.length ?? 0, [config]);
  const rawConfig = useMemo(() => {
    if (!config) return '';
    try {
      return yaml.dump(config, { indent: 2, lineWidth: 120 });
    } catch {
      return '';
    }
  }, [config]);

  const providerOptions = [
    'openai',
    'anthropic',
    'azure',
    'openrouter',
    'together_ai',
    'deepinfra',
    'groq',
    'mistral',
    'perplexity',
    'fireworks_ai',
    'cloudflare',
    'ollama',
    'google',
    'gemini',
    'cohere',
    'replicate',
    'huggingface',
    'vertex'
  ];

  const formatProviderLabel = (value: string) =>
    value
      .split('_')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');

  const collectErrors = (nextConfig: KigoConfig) => {
    const result = KigoConfigSchema.safeParse(nextConfig);
    if (result.success) {
      setErrors({});
      return true;
    }
    const nextErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      if (!nextErrors[path]) nextErrors[path] = issue.message;
    }
    setErrors(nextErrors);
    return false;
  };

  const getError = (path: string) => errors[path];

  const setNextConfig = (nextConfig: KigoConfig) => {
    setConfig(nextConfig);
    if (Object.keys(errors).length > 0) {
      collectErrors(nextConfig);
    }
  };

  const updateModel = (partial: Partial<KigoConfig['model']>) => {
    if (!config) return;
    setNextConfig({ ...config, model: { ...config.model, ...partial } });
  };

  const updateCli = (partial: Partial<KigoConfig['cli']>) => {
    if (!config) return;
    setNextConfig({ ...config, cli: { ...config.cli, ...partial } });
  };

  const updateSkills = (partial: Partial<KigoConfig['skills']>) => {
    if (!config) return;
    setNextConfig({ ...config, skills: { ...config.skills, ...partial } });
  };

  const resetConfig = async () => {
    if (!window.kigo?.config) return;
    setSaveState({ status: 'saving' });
    try {
      const result = await window.kigo.config.init();
      setConfig(result.config);
      setConfigPath(result.path);
      setSaveState({ status: 'saved', message: `Reset to defaults at ${result.path}` });
      void refreshSkills();
    } catch (error) {
      setSaveState({ status: 'error', message: `Reset failed: ${error}` });
    }
  };

  const applyQuickSet = async () => {
    if (!window.kigo?.config) return;
    if (!quickKey.trim()) {
      setQuickSetState({ status: 'error', message: 'Key is required.' });
      return;
    }
    let value: unknown = quickValue;
    try {
      value = JSON.parse(quickValue);
    } catch {
      value = quickValue;
    }
    setQuickSetState({ status: 'saving' });
    try {
      const result = await window.kigo.config.set({ key: quickKey.trim(), value });
      setConfig(result.config);
      setConfigPath(result.path);
      setQuickSetState({ status: 'saved', message: `Set ${quickKey}` });
      void refreshSkills();
    } catch (error) {
      setQuickSetState({ status: 'error', message: `Set failed: ${error}` });
    }
  };

  const saveConfig = async () => {
    if (!config || !window.kigo?.config) return;
    const isValid = collectErrors(config);
    if (!isValid) {
      setSaveState({ status: 'error', message: 'Fix validation errors before saving.' });
      return;
    }
    setSaveState({ status: 'saving' });
    try {
      const result = await window.kigo.config.save({ config });
      setSaveState({ status: 'saved', message: `Saved to ${result.path}` });
      setConfigPath(result.path);
      void refreshSkills();
    } catch (error) {
      setSaveState({ status: 'error', message: `Save failed: ${error}` });
    }
  };

  const refreshAuth = async () => {
    if (!window.kigo?.auth) return;
    const result = await window.kigo.auth.list();
    setAuthProviders(result.providers);
  };

  const handleAuthLogin = async () => {
    if (!window.kigo?.auth) return;
    setAuthState({ status: 'saving', message: 'Logging in...' });
    try {
      const result = await window.kigo.auth.login({ provider: authProvider });
      if (!result.ok) {
        setAuthState({ status: 'error', message: result.message ?? 'Login failed.' });
      } else {
        await refreshAuth();
        setAuthState({ status: 'saved', message: 'Login complete.' });
      }
    } catch (error) {
      setAuthState({ status: 'error', message: `Login failed: ${error}` });
    }
  };

  const handleAuthRevoke = async (provider: string) => {
    if (!window.kigo?.auth) return;
    setAuthState({ status: 'saving', message: `Revoking ${provider}...` });
    try {
      await window.kigo.auth.revoke({ provider });
      await refreshAuth();
      setAuthState({ status: 'saved', message: `${provider} revoked.` });
    } catch (error) {
      setAuthState({ status: 'error', message: `Revoke failed: ${error}` });
    }
  };

  const refreshSkills = async () => {
    if (!window.kigo?.skills) return;
    setSkillsState({ status: 'saving' });
    try {
      const result = await window.kigo.skills.list();
      setSkills(result.skills);
      setSkillsState({ status: 'saved', message: `Loaded ${result.skills.length} skills.` });
    } catch (error) {
      setSkillsState({ status: 'error', message: `Load failed: ${error}` });
    }
  };

  const loadSkill = async (name: string) => {
    if (!window.kigo?.skills) return;
    setSkillsError(null);
    try {
      const result = await window.kigo.skills.get({ name });
      setSelectedSkill(result);
    } catch (error) {
      setSkillsError(String(error));
    }
  };

  const clearSkill = () => {
    setSelectedSkill(null);
  };

  const addMcpServer = async () => {
    if (!window.kigo?.mcp) return;
    if (!mcpForm.name.trim()) {
      setMcpState({ status: 'error', message: 'Server name is required.' });
      return;
    }
    if (mcpForm.transportType === 'stdio' && !mcpForm.command.trim()) {
      setMcpState({ status: 'error', message: 'Command is required for stdio.' });
      return;
    }
    if (mcpForm.transportType !== 'stdio' && !mcpForm.url.trim()) {
      setMcpState({ status: 'error', message: 'URL is required for http/sse.' });
      return;
    }

    const server: MCPServerConfig = {
      name: mcpForm.name.trim(),
      transportType: mcpForm.transportType,
      command: mcpForm.transportType === 'stdio' ? mcpForm.command.trim() : undefined,
      args:
        mcpForm.transportType === 'stdio' && mcpForm.args.trim()
          ? mcpForm.args.split(',').map((item) => item.trim()).filter(Boolean)
          : [],
      url: mcpForm.transportType === 'stdio' ? undefined : mcpForm.url.trim(),
      envVars: parseKeyValuePairs(mcpForm.envVars),
      headers: parseKeyValuePairs(mcpForm.headers),
      cacheToolsList: mcpForm.cacheToolsList,
      allowedTools: parseList(mcpForm.allowedTools),
      blockedTools: parseList(mcpForm.blockedTools)
    };

    setMcpState({ status: 'saving' });
    try {
      const result = await window.kigo.mcp.add({ server });
      setMcpServers(result.servers);
      if (config) setNextConfig({ ...config, mcpServers: result.servers });
      setMcpState({ status: 'saved', message: `Saved to ${result.path}` });
      setMcpForm({
        name: '',
        transportType: 'stdio',
        command: '',
        args: '',
        url: '',
        headers: '',
        envVars: '',
        allowedTools: '',
        blockedTools: '',
        cacheToolsList: true
      });
    } catch (error) {
      setMcpState({ status: 'error', message: `Add failed: ${error}` });
    }
  };

  const testMcpServer = async () => {
    if (!window.kigo?.mcp) return;
    const server: MCPServerConfig = {
      name: mcpForm.name.trim(),
      transportType: mcpForm.transportType,
      command: mcpForm.transportType === 'stdio' ? mcpForm.command.trim() : undefined,
      args:
        mcpForm.transportType === 'stdio' && mcpForm.args.trim()
          ? mcpForm.args.split(',').map((item) => item.trim()).filter(Boolean)
          : [],
      url: mcpForm.transportType === 'stdio' ? undefined : mcpForm.url.trim(),
      envVars: parseKeyValuePairs(mcpForm.envVars),
      headers: parseKeyValuePairs(mcpForm.headers),
      cacheToolsList: mcpForm.cacheToolsList,
      allowedTools: parseList(mcpForm.allowedTools),
      blockedTools: parseList(mcpForm.blockedTools)
    };
    setMcpState({ status: 'saving' });
    try {
      const result = await window.kigo.mcp.test({ server });
      setMcpState({ status: result.ok ? 'saved' : 'error', message: result.message });
    } catch (error) {
      setMcpState({ status: 'error', message: `Test failed: ${error}` });
    }
  };

  const removeMcpServer = async (name: string) => {
    if (!window.kigo?.mcp) return;
    setMcpState({ status: 'saving' });
    try {
      const result = await window.kigo.mcp.remove({ name });
      setMcpServers(result.servers);
      if (config) setNextConfig({ ...config, mcpServers: result.servers });
      setMcpState({ status: 'saved', message: `Saved to ${result.path}` });
    } catch (error) {
      setMcpState({ status: 'error', message: `Remove failed: ${error}` });
    }
  };

  const loadServerIntoForm = (server: MCPServerConfig) => {
    setMcpForm({
      name: server.name,
      transportType: server.transportType,
      command: server.command ?? '',
      args: (server.args ?? []).join(', '),
      url: server.url ?? '',
      headers: formatKeyValuePairs(server.headers ?? {}),
      envVars: formatKeyValuePairs(server.envVars ?? {}),
      allowedTools: (server.allowedTools ?? []).join(', '),
      blockedTools: (server.blockedTools ?? []).join(', '),
      cacheToolsList: server.cacheToolsList ?? true
    });
  };

  const parseKeyValuePairs = (value: string): Record<string, string> => {
    const result: Record<string, string> = {};
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        const [key, ...rest] = item.split('=');
        if (!key) return;
        result[key.trim()] = rest.join('=').trim();
      });
    return result;
  };

  const formatKeyValuePairs = (pairs: Record<string, string>): string => {
    return Object.entries(pairs)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
  };

  const parseList = (value: string): string[] | undefined => {
    const items = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  };

  const startNewSession = () => {
    setSessionId(null);
    setMessages([]);
    setAuditRecords([]);
    setPendingApprovals([]);
    setChatError(null);
    setIsSending(false);
  };

  const loadSession = async (id: string) => {
    if (!window.kigo?.session) return;
    const result = await window.kigo.session.load({ sessionId: id });
    const mapped = result.messages.map((message) => {
      if (message.role === 'tool') {
        return { role: 'system' as const, content: `Tool: ${message.content}` };
      }
      return { role: message.role, content: message.content } as ChatMessage;
    });
    setSessionId(id);
    setMessages(mapped);
    setAuditRecords([]);
    setPendingApprovals([]);
    setChatError(null);
    setIsSending(false);
    if (window.kigo?.audit) {
      const audit = await window.kigo.audit.load({ sessionId: id });
      setAuditRecords(audit.records);
    }
  };

  const beginRenameSession = (session: SessionItem) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title ?? '');
  };

  const cancelRenameSession = () => {
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const confirmRenameSession = async (sessionId: string) => {
    if (!window.kigo?.session) return;
    await window.kigo.session.rename({ sessionId, title: editingTitle.trim() || null });
    await refreshSessions();
    setEditingSessionId(null);
    setEditingTitle('');
    setToast({ message: 'Session renamed.', tone: 'success' });
  };

  const removeSession = async (sessionIdToRemove: string) => {
    if (!window.kigo?.session) return;
    await window.kigo.session.remove({ sessionId: sessionIdToRemove });
    if (sessionIdToRemove === sessionId) {
      startNewSession();
    }
    await refreshSessions();
    setToast({ message: 'Session deleted.', tone: 'success' });
  };

  const requestDeleteSession = (sessionIdToRemove: string) => {
    setDeleteConfirmId(sessionIdToRemove);
  };

  const confirmDeleteSession = async () => {
    if (!deleteConfirmId) return;
    await removeSession(deleteConfirmId);
    setDeleteConfirmId(null);
  };

  const cancelDeleteSession = () => {
    setDeleteConfirmId(null);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!config) return;
    setConfigSummary({
      path: configPath,
      model: config.model.name,
      provider: config.model.provider
    });
  }, [config, configPath]);

  const appendSystemMessage = (content: string) => {
    setMessages((prev) => [...prev, { role: 'system', content }]);
  };

  const handleSlashCommand = async (input: string): Promise<boolean> => {
    if (!input.trim().startsWith('/')) return false;
    const [command, ...args] = input.trim().slice(1).split(/\s+/);
    const normalized = command.toLowerCase();
    const helpText = [
      '/help - Show this help',
      '/clear - Clear conversation history',
      '/status - Show session status',
      '/config - Show configuration summary',
      '/session - List recent sessions',
      '/exit - Quit Kigo Desktop'
    ].join('\n');

    if (normalized === 'help') {
      appendSystemMessage(helpText);
      return true;
    }

    if (normalized === 'clear') {
      startNewSession();
      appendSystemMessage('Conversation cleared.');
      return true;
    }

    if (normalized === 'exit') {
      appendSystemMessage('Closing Kigo Desktop...');
      await window.kigo?.app?.quit();
      return true;
    }

    if (normalized === 'status') {
      const messageCount = messages.filter((message) => message.role !== 'system').length;
      appendSystemMessage(
        [
          'Session Status:',
          `ID: ${sessionId ?? 'Not started'}`,
          `Model: ${config?.model.name ?? 'Unknown'}`,
          `Provider: ${config?.model.provider ?? 'Unknown'}`,
          `Messages: ${messageCount}`
        ].join('\n')
      );
      return true;
    }

    if (normalized === 'config') {
      appendSystemMessage(
        [
          'Configuration:',
          `Model: ${config?.model.name ?? 'Unknown'}`,
          `Provider: ${config?.model.provider ?? 'Unknown'}`,
          `Stream: ${config?.cli.stream ? 'true' : 'false'}`,
          `MCP Servers: ${config?.mcpServers?.length ?? 0}`,
          `Skills: ${config?.skills.enabled ? 'enabled' : 'disabled'}`
        ].join('\n')
      );
      return true;
    }

    if (normalized === 'session') {
      if (!window.kigo?.session) return true;
      const result = await window.kigo.session.list();
      const list = result.sessions
        .map((session) => `- ${session.title ?? session.id} (${new Date(session.updatedAt).toLocaleString()})`)
        .join('\n');
      appendSystemMessage(['Sessions:', list || 'No sessions.'].join('\n'));
      return true;
    }

    if (normalized) {
      appendSystemMessage(`Unknown command: /${normalized}`);
      if (args.length > 0) {
        appendSystemMessage(`Args: ${args.join(' ')}`);
      }
      appendSystemMessage('Try /help for available commands.');
      return true;
    }

    return false;
  };

  const sendMessage = async () => {
    if (!window.kigo?.chat || !chatInput.trim()) return;
    setChatError(null);
    setIsSending(true);
    const message = chatInput.trim();
    setChatInput('');
    if (await handleSlashCommand(message)) {
      setIsSending(false);
      return;
    }
    setMessages((prev) => [...prev, { role: 'user', content: message }, { role: 'assistant', content: '' }]);
    try {
      const result = await window.kigo.chat.start({ input: message, sessionId: sessionId ?? undefined });
      setSessionId(result.sessionId);
    } catch (error) {
      setIsSending(false);
      setChatError(`Start failed: ${error}`);
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      const isInput = target && ['INPUT', 'TEXTAREA'].includes(target.tagName);
      const metaKey = event.metaKey || event.ctrlKey;

      if (!metaKey) return;

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        startNewSession();
        chatInputRef.current?.focus();
      }

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        chatInputRef.current?.focus();
      }

      if (event.key.toLowerCase() === 'f') {
        if (isInput) return;
        event.preventDefault();
        sessionSearchRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleApproval = async (requestId: string, approved: boolean) => {
    if (!window.kigo?.chat || !sessionId) return;
    await window.kigo.chat.approve({ sessionId, requestId, approved });
    setPendingApprovals((prev) => prev.filter((item) => item.requestId !== requestId));
    setAuditRecords((prev) => [
      ...prev,
      {
        sessionId,
        timestamp: Date.now(),
        type: 'approval_decision',
        data: { requestId, approved }
      }
    ]);
  };

  const filteredAudit = useMemo(() => {
    return auditRecords.filter((record) => auditFilters[record.type]);
  }, [auditRecords, auditFilters]);

  const toggleAuditFilter = (type: AuditRecord['type']) => {
    setAuditFilters((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const exportSession = async (format: 'markdown' | 'json') => {
    if (!sessionId || !window.kigo?.export) {
      setToast({ message: 'Select a session to export.', tone: 'error' });
      return;
    }
    try {
      const result = await window.kigo.export.session({ sessionId, format });
      setToast({ message: `Exported to ${result.path}`, tone: 'success' });
    } catch (error) {
      setToast({ message: `Export failed: ${error}`, tone: 'error' });
    }
  };

  const exportAudit = async (format: 'jsonl' | 'json') => {
    if (!sessionId || !window.kigo?.export) {
      setToast({ message: 'Select a session to export.', tone: 'error' });
      return;
    }
    try {
      const result = await window.kigo.export.audit({ sessionId, format });
      setToast({ message: `Audit exported to ${result.path}`, tone: 'success' });
    } catch (error) {
      setToast({ message: `Export failed: ${error}`, tone: 'error' });
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" />
          <span>Kigo Desktop</span>
        </div>
        <nav className="nav">
          <NavLink to="/sessions" end className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
            Sessions
          </NavLink>
          <NavLink to="/mcp" className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
            MCP Servers
          </NavLink>
          <NavLink to="/skills" className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
            Skills
          </NavLink>
          <NavLink to="/auth" className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
            Auth
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
            Settings
          </NavLink>
        </nav>
        <div className="sessions">
          <div className="sessions-header">
            <span>Recent Sessions</span>
            <button className="ghost small" onClick={refreshSessions}>
              Refresh
            </button>
          </div>
          <div className="sessions-search">
            <input
              type="text"
              value={sessionQuery}
              onChange={(event) => setSessionQuery(event.target.value)}
              placeholder="Search sessions"
              ref={sessionSearchRef}
            />
            <select value={sessionFilter} onChange={(event) => setSessionFilter(event.target.value as typeof sessionFilter)}>
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="week">Last 7 days</option>
            </select>
            <select value={sessionSort} onChange={(event) => setSessionSort(event.target.value as typeof sessionSort)}>
              <option value="updated">Updated</option>
              <option value="created">Created</option>
              <option value="messages">Messages</option>
            </select>
            <button
              className="ghost small"
              onClick={() => setSessionSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            >
              {sessionSortDir === 'desc' ? '↓' : '↑'}
            </button>
          </div>
          <div className="sessions-list">
            {filteredSessions.length === 0 ? (
              <div className="empty">No sessions yet.</div>
            ) : (
              filteredSessions.map((session) => (
                <div key={session.id} className={`session-item ${sessionId === session.id ? 'active' : ''}`}>
                  <button className="session-main" onClick={() => loadSession(session.id)}>
                    <div className="session-title">{session.title ?? 'Untitled session'}</div>
                    <div className="session-meta">{new Date(session.updatedAt).toLocaleString()}</div>
                  </button>
                  <div className="row-actions">
                  <button className="ghost small" onClick={() => beginRenameSession(session)}>
                      Rename
                    </button>
                    <button className="ghost small" onClick={() => requestDeleteSession(session.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="sidebar-footer">
          <button className="secondary" onClick={startNewSession}>
            New Session
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="title">Project Alpha</div>
            <div className="subtitle">Workspace: ~/Projects/alpha</div>
          </div>
          <div className="actions">
            <button className="ghost">Search</button>
            <button className="primary">Run</button>
          </div>
        </header>

        <section className="content">
          <Routes>
            <Route path="/" element={<Navigate to="/sessions" replace />} />
            <Route
              path="/sessions"
              element={
                <>
                  {deleteConfirmId ? (
                    <div className="modal-backdrop">
                      <div className="modal">
                        <h3>Delete session?</h3>
                        <p>This will remove the session and its history from local storage.</p>
                        <div className="row-actions">
                          <button className="ghost" onClick={cancelDeleteSession}>
                            Cancel
                          </button>
                          <button className="primary" onClick={confirmDeleteSession}>
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {editingSessionId ? (
                    <div className="panel">
                      <div className="panel-header">
                        <h2>Rename Session</h2>
                        <span className="badge neutral">Editing</span>
                      </div>
                      <div className="panel-body">
                        <div className="chat-input">
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(event) => setEditingTitle(event.target.value)}
                            placeholder="Session title"
                          />
                          <div className="row-actions">
                            <button className="ghost" onClick={cancelRenameSession}>
                              Cancel
                            </button>
                            <button className="primary" onClick={() => confirmRenameSession(editingSessionId)}>
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="panel">
                    <div className="panel-header">
                      <h2>Conversation</h2>
                      <span className="badge">Streaming</span>
                    </div>
                    <div className="panel-body">
                      <div className="message muted">Welcome to Kigo Desktop.</div>
                      {configSummary ? (
                        <div className="message muted">
                          Config: {configSummary.model} ({configSummary.provider}) · {configSummary.path}
                        </div>
                      ) : null}
                      <div className="chat-messages">
                        {messages.length === 0 ? (
                          <div className="message muted">Send a message to begin a session.</div>
                        ) : (
                          messages.map((message, index) => (
                            <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
                              {message.content || (message.role === 'assistant' ? '...' : '')}
                            </div>
                          ))
                        )}
                      </div>
                      {chatError ? <div className="message error-text">{chatError}</div> : null}
                      <div className="chat-input">
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(event) => setChatInput(event.target.value)}
                          placeholder="Ask Kigo to help..."
                          disabled={isSending}
                          ref={chatInputRef}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') sendMessage();
                          }}
                        />
                        <button className="primary" onClick={sendMessage} disabled={isSending || !chatInput.trim()}>
                          {isSending ? 'Sending...' : 'Send'}
                        </button>
                      </div>
                      <div className="export-row">
                        <button className="ghost small" onClick={() => exportSession('markdown')}>
                          Export Markdown
                        </button>
                        <button className="ghost small" onClick={() => exportSession('json')}>
                          Export JSON
                        </button>
                        <button className="ghost small" onClick={() => exportAudit('jsonl')}>
                          Export Audit
                        </button>
                        <button className="ghost small" onClick={() => exportAudit('json')}>
                          Export Audit JSON
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-header">
                      <h2>Tool Approvals</h2>
                      <span className="badge neutral">{pendingApprovals.length} pending</span>
                    </div>
                    <div className="panel-body">
                      {pendingApprovals.length === 0 ? (
                        <div className="empty">No pending approvals.</div>
                      ) : (
                        <div className="approval-list">
                          {pendingApprovals.map((item) => (
                            <div key={item.requestId} className="approval-card">
                              <div>
                                <div className="mcp-title">{item.toolName}</div>
                                <div className="mcp-meta">Source: {item.source}</div>
                                <pre className="approval-params">{item.params}</pre>
                              </div>
                              <div className="row-actions">
                                <button className="ghost" onClick={() => handleApproval(item.requestId, false)}>
                                  Deny
                                </button>
                                <button className="primary" onClick={() => handleApproval(item.requestId, true)}>
                                  Approve
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="divider" />
                      <div className="audit-filters">
                        <label>
                          <input
                            type="checkbox"
                            checked={auditFilters.tool_call}
                            onChange={() => toggleAuditFilter('tool_call')}
                          />
                          Tool Calls
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={auditFilters.tool_output}
                            onChange={() => toggleAuditFilter('tool_output')}
                          />
                          Tool Output
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={auditFilters.approval_request}
                            onChange={() => toggleAuditFilter('approval_request')}
                          />
                          Approvals
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={auditFilters.approval_decision}
                            onChange={() => toggleAuditFilter('approval_decision')}
                          />
                          Decisions
                        </label>
                      </div>
                      <div className="tool-log">
                        {filteredAudit.length === 0 ? (
                          <div className="empty">No tool activity yet.</div>
                        ) : (
                          filteredAudit.map((record) => (
                            <div key={`${record.type}-${record.timestamp}`} className="tool-event">
                              <div className="mcp-title">{record.type.replace('_', ' ')}</div>
                              <div className="mcp-meta">{JSON.stringify(record.data)}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              }
            />
            <Route
              path="/skills"
              element={
                <div className="panel">
                  <div className="panel-header">
                    <h2>Skills</h2>
                    <span className="badge neutral">{skills.length} loaded</span>
                  </div>
                  <div className="panel-body">
                    <div className="row-actions">
                      <button className="ghost" onClick={refreshSkills} disabled={skillsState.status === 'saving'}>
                        Refresh
                      </button>
                      <button className="ghost" onClick={clearSkill} disabled={!selectedSkill}>
                        Clear
                      </button>
                    </div>
                    {skillsState.status !== 'idle' ? (
                      <div className={`status status-${skillsState.status}`}>{skillsState.message ?? skillsState.status}</div>
                    ) : null}
                    {!config?.skills.enabled ? (
                      <div className="empty">Skills are disabled in configuration.</div>
                    ) : (
                      <div className="skills-layout">
                        <div className="skills-list">
                          {skills.length === 0 ? (
                            <div className="empty">No skills found.</div>
                          ) : (
                            skills.map((skill) => (
                              <button
                                key={skill.name}
                                className={`skills-item ${selectedSkill?.name === skill.name ? 'active' : ''}`}
                                onClick={() => loadSkill(skill.name)}
                              >
                                <div className="mcp-title">{skill.name}</div>
                                <div className="mcp-meta">{skill.description}</div>
                              </button>
                            ))
                          )}
                        </div>
                        <div className="skills-detail">
                          {skillsError ? <div className="message error-text">{skillsError}</div> : null}
                          {!selectedSkill ? (
                            <div className="empty">Select a skill to view details.</div>
                          ) : (
                            <div className="skills-card">
                              <div className="mcp-title">{selectedSkill.name}</div>
                              <div className="mcp-meta">{selectedSkill.description}</div>
                              <div className="skill-meta">Path: {selectedSkill.path}</div>
                              {selectedSkill.allowedTools && selectedSkill.allowedTools.length > 0 ? (
                                <div className="skill-meta">Allowed tools: {selectedSkill.allowedTools.join(', ')}</div>
                              ) : (
                                <div className="skill-meta">Allowed tools: all</div>
                              )}
                              <pre className="skill-content">{selectedSkill.content}</pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              }
            />
            <Route
              path="/auth"
              element={
                <div className="panel">
                  <div className="panel-header">
                    <h2>Auth</h2>
                    <span className="badge neutral">{authProviders.length} providers</span>
                  </div>
                  <div className="panel-body">
                    <div className="form-grid">
                      <label className="field">
                        <span>Provider</span>
                        <select value={authProvider} onChange={(event) => setAuthProvider(event.target.value)}>
                          <option value="google">google</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Actions</span>
                        <div className="row-actions">
                          <button className="primary" onClick={handleAuthLogin} disabled={authState.status === 'saving'}>
                            {authState.status === 'saving' ? 'Logging in...' : 'Login'}
                          </button>
                          <button className="ghost" onClick={refreshAuth}>
                            Refresh
                          </button>
                        </div>
                      </label>
                    </div>
                    <div className="status">Login starts a local callback server on port 8085.</div>
                    {authState.status !== 'idle' ? (
                      <div className={`status status-${authState.status}`}>{authState.message ?? authState.status}</div>
                    ) : null}
                    <div className="mcp-list">
                      {authProviders.length === 0 ? (
                        <div className="empty">No providers configured.</div>
                      ) : (
                        authProviders.map((provider) => (
                          <div key={provider.provider} className="mcp-card">
                            <div>
                              <div className="mcp-title">{provider.provider}</div>
                              <div className="mcp-meta">
                                {provider.email ?? 'No email'}
                                {provider.expiresAt ? ` · Expires ${new Date(provider.expiresAt).toLocaleString()}` : ''}
                                {provider.expired ? ' · expired' : ''}
                              </div>
                            </div>
                            <div className="row-actions">
                              <button className="ghost" onClick={() => handleAuthRevoke(provider.provider)}>
                                Revoke
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              }
            />
            <Route
              path="/settings"
              element={
                <div className="panel">
                  <div className="panel-header">
                    <h2>Configuration</h2>
                    <span className="badge neutral">{mcpCount} MCP</span>
                  </div>
                  <div className="panel-body">
                    <div className="form-grid">
                      <label className="field">
                        <span>Model</span>
                        <input
                          type="text"
                          value={config?.model.name ?? ''}
                          onChange={(event) => updateModel({ name: event.target.value })}
                          disabled={!isReady}
                        />
                        {getError('model.name') ? <span className="error-text">{getError('model.name')}</span> : null}
                      </label>
                      <label className={`field ${getError('model.provider') ? 'has-error' : ''}`}>
                        <span>Provider</span>
                        <select
                          value={config?.model.provider ?? 'openai'}
                          onChange={(event) => updateModel({ provider: event.target.value })}
                          disabled={!isReady}
                        >
                          {providerOptions.map((provider) => (
                            <option key={provider} value={provider}>
                              {formatProviderLabel(provider)}
                            </option>
                          ))}
                        </select>
                        {getError('model.provider') ? (
                          <span className="error-text">{getError('model.provider')}</span>
                        ) : null}
                      </label>
                      <label className={`field ${getError('model.apiKey') ? 'has-error' : ''}`}>
                        <span>API Key</span>
                        <input
                          type="password"
                          value={config?.model.apiKey ?? ''}
                          onChange={(event) => updateModel({ apiKey: event.target.value || undefined })}
                          placeholder="Stored securely"
                          disabled={!isReady}
                        />
                        {getError('model.apiKey') ? <span className="error-text">{getError('model.apiKey')}</span> : null}
                      </label>
                      <label className={`field ${getError('model.baseUrl') ? 'has-error' : ''}`}>
                        <span>Base URL</span>
                        <input
                          type="text"
                          value={config?.model.baseUrl ?? ''}
                          onChange={(event) => updateModel({ baseUrl: event.target.value || undefined })}
                          placeholder="Optional"
                          disabled={!isReady}
                        />
                        {getError('model.baseUrl') ? <span className="error-text">{getError('model.baseUrl')}</span> : null}
                      </label>
                      <label className={`field ${getError('model.reasoningEffort') ? 'has-error' : ''}`}>
                        <span>Reasoning Effort</span>
                        <select
                          value={config?.model.reasoningEffort ?? ''}
                          onChange={(event) =>
                            updateModel({
                              reasoningEffort: event.target.value
                                ? (event.target.value as KigoConfig['model']['reasoningEffort'])
                                : undefined
                            })
                          }
                          disabled={!isReady}
                        >
                          <option value="">Default</option>
                          <option value="none">None</option>
                          <option value="minimal">Minimal</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                        {getError('model.reasoningEffort') ? (
                          <span className="error-text">{getError('model.reasoningEffort')}</span>
                        ) : null}
                      </label>
                      <label className={`field ${getError('cli.session') ? 'has-error' : ''}`}>
                        <span>CLI Session</span>
                        <input
                          type="text"
                          value={config?.cli.session ?? ''}
                          onChange={(event) => updateCli({ session: event.target.value || undefined })}
                          placeholder="Optional session name"
                          disabled={!isReady}
                        />
                        {getError('cli.session') ? <span className="error-text">{getError('cli.session')}</span> : null}
                      </label>
                      <label className={`field ${getError('cli.stream') ? 'has-error' : ''}`}>
                        <span>Stream Responses</span>
                        <div className="toggle">
                          <input
                            type="checkbox"
                            checked={config?.cli.stream ?? true}
                            onChange={(event) => updateCli({ stream: event.target.checked })}
                            disabled={!isReady}
                          />
                          <span>{config?.cli.stream ? 'Enabled' : 'Disabled'}</span>
                        </div>
                        {getError('cli.stream') ? <span className="error-text">{getError('cli.stream')}</span> : null}
                      </label>
                      <label className={`field ${getError('skills.enabled') ? 'has-error' : ''}`}>
                        <span>Skills</span>
                        <div className="toggle">
                          <input
                            type="checkbox"
                            checked={config?.skills.enabled ?? true}
                            onChange={(event) => updateSkills({ enabled: event.target.checked })}
                            disabled={!isReady}
                          />
                          <span>{config?.skills.enabled ? 'Enabled' : 'Disabled'}</span>
                        </div>
                        {getError('skills.enabled') ? <span className="error-text">{getError('skills.enabled')}</span> : null}
                      </label>
                      <label className={`field ${getError('skills.projectSkillsDir') ? 'has-error' : ''}`}>
                        <span>Project Skills Dir</span>
                        <input
                          type="text"
                          value={config?.skills.projectSkillsDir ?? ''}
                          onChange={(event) => updateSkills({ projectSkillsDir: event.target.value })}
                          disabled={!isReady}
                        />
                        {getError('skills.projectSkillsDir') ? (
                          <span className="error-text">{getError('skills.projectSkillsDir')}</span>
                        ) : null}
                      </label>
                      <label className={`field ${getError('skills.userSkillsDir') ? 'has-error' : ''}`}>
                        <span>User Skills Dir</span>
                        <input
                          type="text"
                          value={config?.skills.userSkillsDir ?? ''}
                          onChange={(event) => updateSkills({ userSkillsDir: event.target.value })}
                          disabled={!isReady}
                        />
                        {getError('skills.userSkillsDir') ? (
                          <span className="error-text">{getError('skills.userSkillsDir')}</span>
                        ) : null}
                      </label>
                    </div>

                    <div className="divider" />
                    <div className="row-actions">
                      <button className="ghost small" onClick={() => setShowAdvancedConfig((prev) => !prev)}>
                        {showAdvancedConfig ? 'Hide Advanced' : 'Show Advanced'}
                      </button>
                      <button className="ghost small" onClick={() => setShowRawConfig((prev) => !prev)}>
                        {showRawConfig ? 'Hide YAML' : 'View YAML'}
                      </button>
                    </div>

                    {showAdvancedConfig ? (
                      <div className="form-grid">
                        <label className={`field ${getError('model.azureApiVersion') ? 'has-error' : ''}`}>
                          <span>Azure API Version</span>
                          <input
                            type="text"
                            value={config?.model.azureApiVersion ?? ''}
                            onChange={(event) => updateModel({ azureApiVersion: event.target.value || undefined })}
                            placeholder="2024-06-01"
                            disabled={!isReady}
                          />
                          {getError('model.azureApiVersion') ? (
                            <span className="error-text">{getError('model.azureApiVersion')}</span>
                          ) : null}
                        </label>
                        <label className={`field ${getError('model.vertexAiLocation') ? 'has-error' : ''}`}>
                          <span>Vertex Location</span>
                          <input
                            type="text"
                            value={config?.model.vertexAiLocation ?? ''}
                            onChange={(event) => updateModel({ vertexAiLocation: event.target.value || undefined })}
                            placeholder="us-central1"
                            disabled={!isReady}
                          />
                          {getError('model.vertexAiLocation') ? (
                            <span className="error-text">{getError('model.vertexAiLocation')}</span>
                          ) : null}
                        </label>
                        <label className={`field ${getError('model.vertexAiCredentialsPath') ? 'has-error' : ''}`}>
                          <span>Vertex Credentials Path</span>
                          <input
                            type="text"
                            value={config?.model.vertexAiCredentialsPath ?? ''}
                            onChange={(event) =>
                              updateModel({ vertexAiCredentialsPath: event.target.value || undefined })
                            }
                            placeholder="~/.config/gcloud/application_default_credentials.json"
                            disabled={!isReady}
                          />
                          {getError('model.vertexAiCredentialsPath') ? (
                            <span className="error-text">{getError('model.vertexAiCredentialsPath')}</span>
                          ) : null}
                        </label>
                      </div>
                    ) : null}

                    {showRawConfig ? (
                      <div className="raw-config">
                        <pre>{rawConfig}</pre>
                      </div>
                    ) : null}

                    <div className="status">LSP is CLI-only. Run `kigo lsp` in a terminal.</div>

                    <div className="divider" />
                    <div className="form-grid">
                      <label className="field">
                        <span>Quick Set Key</span>
                        <input
                          type="text"
                          value={quickKey}
                          onChange={(event) => setQuickKey(event.target.value)}
                          placeholder="model.name"
                          disabled={!isReady}
                        />
                      </label>
                      <label className="field">
                        <span>Quick Set Value</span>
                        <input
                          type="text"
                          value={quickValue}
                          onChange={(event) => setQuickValue(event.target.value)}
                          placeholder="gpt-4o"
                          disabled={!isReady}
                        />
                      </label>
                    </div>
                    {quickSetState.status !== 'idle' ? (
                      <div className={`status status-${quickSetState.status}`}>
                        {quickSetState.message ?? quickSetState.status}
                      </div>
                    ) : null}

                    <div className="save-row">
                      <div className="save-meta">
                        <div className="path">Path: {configPath || 'Loading...'}</div>
                        {saveState.status !== 'idle' ? (
                          <div className={`status status-${saveState.status}`}>
                            {saveState.message ?? saveState.status}
                          </div>
                        ) : null}
                      </div>
                      <div className="row-actions">
                        <button
                          className="ghost"
                          onClick={applyQuickSet}
                          disabled={!isReady || quickSetState.status === 'saving'}
                        >
                          Apply Quick Set
                        </button>
                        <button className="ghost" onClick={resetConfig} disabled={!isReady || saveState.status === 'saving'}>
                          Reset Defaults
                        </button>
                        <button className="primary" onClick={saveConfig} disabled={!isReady || saveState.status === 'saving'}>
                          {saveState.status === 'saving' ? 'Saving...' : 'Save Config'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              }
            />
            <Route
              path="/mcp"
              element={
                <div className="panel">
                  <div className="panel-header">
                    <h2>MCP Servers</h2>
                    <span className="badge neutral">{mcpServers.length} active</span>
                  </div>
                  <div className="panel-body">
                    <div className="mcp-list">
                      {mcpServers.length === 0 ? (
                        <div className="empty">No MCP servers configured.</div>
                      ) : (
                        mcpServers.map((server) => (
                          <div key={server.name} className="mcp-card">
                            <div>
                              <div className="mcp-title">{server.name}</div>
                              <div className="mcp-meta">
                                {server.transportType}
                                {server.command ? ` · ${server.command}` : ''}
                                {server.url ? ` · ${server.url}` : ''}
                              </div>
                            </div>
                            <div className="row-actions">
                              <button className="ghost" onClick={() => loadServerIntoForm(server)}>
                                Edit
                              </button>
                              <button className="ghost" onClick={() => removeMcpServer(server.name)}>
                                Remove
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="divider" />

                    <div className="form-grid">
                      <label className="field">
                        <span>Name</span>
                        <input
                          type="text"
                          value={mcpForm.name}
                          onChange={(event) => setMcpForm({ ...mcpForm, name: event.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Transport</span>
                        <select
                          value={mcpForm.transportType}
                          onChange={(event) =>
                            setMcpForm({
                              ...mcpForm,
                              transportType: event.target.value as MCPFormState['transportType']
                            })
                          }
                        >
                          <option value="stdio">stdio</option>
                          <option value="http">http</option>
                          <option value="sse">sse</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Command</span>
                        <input
                          type="text"
                          value={mcpForm.command}
                          onChange={(event) => setMcpForm({ ...mcpForm, command: event.target.value })}
                          disabled={mcpForm.transportType !== 'stdio'}
                          placeholder="python -m server"
                        />
                      </label>
                      <label className="field">
                        <span>Args (comma separated)</span>
                        <input
                          type="text"
                          value={mcpForm.args}
                          onChange={(event) => setMcpForm({ ...mcpForm, args: event.target.value })}
                          disabled={mcpForm.transportType !== 'stdio'}
                          placeholder="--flag, value"
                        />
                      </label>
                      <label className="field">
                        <span>URL</span>
                        <input
                          type="text"
                          value={mcpForm.url}
                          onChange={(event) => setMcpForm({ ...mcpForm, url: event.target.value })}
                          disabled={mcpForm.transportType === 'stdio'}
                          placeholder="http://localhost:8000"
                        />
                      </label>
                      <label className="field">
                        <span>Headers (key=value, comma separated)</span>
                        <input
                          type="text"
                          value={mcpForm.headers}
                          onChange={(event) => setMcpForm({ ...mcpForm, headers: event.target.value })}
                          disabled={mcpForm.transportType === 'stdio'}
                          placeholder="Authorization=Bearer x, X-Client=Kigo"
                        />
                      </label>
                      <label className="field">
                        <span>Env Vars (key=value, comma separated)</span>
                        <input
                          type="text"
                          value={mcpForm.envVars}
                          onChange={(event) => setMcpForm({ ...mcpForm, envVars: event.target.value })}
                          disabled={mcpForm.transportType !== 'stdio'}
                          placeholder="API_KEY=xxx, MODE=dev"
                        />
                      </label>
                      <label className="field">
                        <span>Allowed Tools (comma separated)</span>
                        <input
                          type="text"
                          value={mcpForm.allowedTools}
                          onChange={(event) => setMcpForm({ ...mcpForm, allowedTools: event.target.value })}
                          placeholder="read_file, write_file"
                        />
                      </label>
                      <label className="field">
                        <span>Blocked Tools (comma separated)</span>
                        <input
                          type="text"
                          value={mcpForm.blockedTools}
                          onChange={(event) => setMcpForm({ ...mcpForm, blockedTools: event.target.value })}
                          placeholder="run_shell"
                        />
                      </label>
                      <label className="field">
                        <span>Cache Tools List</span>
                        <div className="toggle">
                          <input
                            type="checkbox"
                            checked={mcpForm.cacheToolsList}
                            onChange={(event) => setMcpForm({ ...mcpForm, cacheToolsList: event.target.checked })}
                          />
                          <span>{mcpForm.cacheToolsList ? 'Enabled' : 'Disabled'}</span>
                        </div>
                      </label>
                    </div>

                    <div className="save-row">
                      <div className="save-meta">
                        {mcpState.status !== 'idle' ? (
                          <div className={`status status-${mcpState.status}`}>{mcpState.message ?? mcpState.status}</div>
                        ) : (
                          <div className="status">Manage MCP servers for this workspace.</div>
                        )}
                      </div>
                      <div className="row-actions">
                        <button className="ghost" onClick={testMcpServer} disabled={mcpState.status === 'saving'}>
                          Test
                        </button>
                        <button className="primary" onClick={addMcpServer} disabled={mcpState.status === 'saving'}>
                          {mcpState.status === 'saving' ? 'Saving...' : 'Save Server'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              }
            />
            <Route path="*" element={<Navigate to="/sessions" replace />} />
          </Routes>
        </section>
        {toast ? (
          <div className={`toast ${toast.tone}`}>
            {toast.message}
          </div>
        ) : null}
      </main>
    </div>
  );
}
