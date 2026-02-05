
export class DatabaseSync {
  constructor() { throw new Error('node:sqlite is not available in this runtime.'); }
}
export class StatementSync {
  constructor() { throw new Error('node:sqlite is not available in this runtime.'); }
}
export class Session {
  constructor() { throw new Error('node:sqlite is not available in this runtime.'); }
}
export class Backup {
  constructor() { throw new Error('node:sqlite is not available in this runtime.'); }
}
export default { DatabaseSync, StatementSync, Session, Backup };
