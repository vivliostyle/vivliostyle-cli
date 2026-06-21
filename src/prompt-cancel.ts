export class PromptCancelError extends Error {
  constructor() {
    super('Prompt canceled');
    this.name = 'PromptCancelError';
  }
}
