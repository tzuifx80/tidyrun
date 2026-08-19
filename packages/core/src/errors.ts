export class TidyRunError extends Error {
  constructor(message: string, readonly code = "TIDYRUN_ERROR") {
    super(message);
    this.name = "TidyRunError";
  }
}

export class TidyRunSecurityError extends TidyRunError {
  constructor(message: string) {
    super(message, "TIDYRUN_SECURITY");
    this.name = "TidyRunSecurityError";
  }
}
