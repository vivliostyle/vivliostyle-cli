import { beforeEach, expect, it, vi } from 'vitest';

const mockedPrompt = vi.hoisted(() => ({
  cancelSymbol: Symbol('cancel'),
  prompt: vi.fn<() => Promise<symbol>>(),
}));

vi.mock('@clack/core', () => {
  class PromptClass {
    prompt = mockedPrompt.prompt;
  }

  return {
    AutocompletePrompt: PromptClass,
    getColumns: vi.fn<() => number>(() => 80),
    isCancel: vi.fn<(value: unknown) => boolean>(
      (value) => value === mockedPrompt.cancelSymbol,
    ),
    MultiSelectPrompt: PromptClass,
    SelectPrompt: PromptClass,
    TextPrompt: PromptClass,
  };
});

vi.mock('@clack/prompts', () => ({
  limitOptions: vi.fn<
    ({
      options,
    }: {
      options: { label?: string; value?: unknown }[];
    }) => string[]
  >(({ options }) =>
    options.map(({ label, value }) => label ?? String(value ?? '')),
  ),
}));

import { PromptCancelError } from '../src/entry-util.js';
import { askQuestion, InteractiveLogger } from '../src/interactive.js';

beforeEach(() => {
  mockedPrompt.prompt.mockReset();
});

it('throws a prompt cancellation error instead of exiting the process', async () => {
  mockedPrompt.prompt.mockResolvedValue(mockedPrompt.cancelSymbol);

  await expect(
    askQuestion({
      question: {
        title: {
          type: 'text',
          message: 'Title',
        },
      },
      interactiveLogger: new InteractiveLogger(),
    }),
  ).rejects.toBeInstanceOf(PromptCancelError);
});
