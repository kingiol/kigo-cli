interface Window {
  kigo?: {
    config: {
      get: () => Promise<import('../shared/ipc').ConfigGetResponse>;
      save: (payload: import('../shared/ipc').ConfigSavePayload) => Promise<{ path: string }>;
      path: () => Promise<import('../shared/ipc').ConfigPathResponse>;
    };
    mcp: {
      list: () => Promise<import('../shared/ipc').MCPListResponse>;
      add: (payload: import('../shared/ipc').MCPAddPayload) => Promise<import('../shared/ipc').MCPAddResponse>;
      remove: (payload: import('../shared/ipc').MCPRemovePayload) => Promise<import('../shared/ipc').MCPRemoveResponse>;
      test: (payload: import('../shared/ipc').MCPTestPayload) => Promise<import('../shared/ipc').MCPTestResponse>;
    };
    chat: {
      start: (payload: import('../shared/ipc').ChatStartPayload) => Promise<import('../shared/ipc').ChatStartResponse>;
      approve: (payload: import('../shared/ipc').ChatApprovePayload) => Promise<void>;
      onEvent: (handler: (payload: import('../shared/ipc').ChatEventPayload) => void) => () => void;
      onApproval: (handler: (payload: import('../shared/ipc').ChatApprovalPayload) => void) => () => void;
    };
    session: {
      list: () => Promise<import('../shared/ipc').SessionListResponse>;
      load: (payload: import('../shared/ipc').SessionLoadPayload) => Promise<import('../shared/ipc').SessionLoadResponse>;
      rename: (payload: import('../shared/ipc').SessionRenamePayload) => Promise<{ ok: boolean }>;
      remove: (payload: import('../shared/ipc').SessionDeletePayload) => Promise<{ ok: boolean }>;
    };
    audit: {
      load: (payload: import('../shared/ipc').AuditLoadPayload) => Promise<import('../shared/ipc').AuditLoadResponse>;
    };
    export: {
      session: (payload: import('../shared/ipc').ExportSessionPayload) => Promise<import('../shared/ipc').ExportSessionResponse>;
      audit: (payload: import('../shared/ipc').ExportAuditPayload) => Promise<import('../shared/ipc').ExportAuditResponse>;
    };
  };
}
