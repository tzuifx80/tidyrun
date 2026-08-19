export class LeanAgentError extends Error {
  constructor(message: string, readonly code = "LEANAGENT_ERROR") {
    super(message);
    this.name = "LeanAgentError";
  }
}

export class LeanAgentSecurityError extends LeanAgentError {
  constructor(message: string) {
    super(message, "LEANAGENT_SECURITY");
    this.name = "LeanAgentSecurityError";
  }
}
