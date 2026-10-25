import { describe, expect, it } from 'vitest';
import { createContextBuilder } from '@aula/agent-runtime';
import { loadAgentConfig } from '../config/agent-config';
import { createSystemPrompt } from './system-prompt';

const environment = {
  OPENAI_API_KEY: 'test-key',
  OPENAI_MODEL: 'test-model',
  AULA_DOCS_DIRECTORY: '/tmp/docs',
  AULA_SESSION_DIRECTORY: '/tmp/sessions',
};

describe('System prompt assembly', () => {
  it.each([undefined, 'Custom study instructions'])(
    'provides a prompt to Context with override=%s',
    (override) => {
      const config = loadAgentConfig({ ...environment, AULA_SYSTEM_PROMPT: override });
      const prompt = createSystemPrompt(config);
      const context = createContextBuilder({
        getSystemPrompt: prompt.getSystemPrompt,
        getTools: () => [],
      });
      const request = context.build([{ role: 'user', content: 'Question' }]);
      expect(request.messages[0]).toEqual({
        role: 'system',
        content: override ?? expect.stringMatching(/\S/),
      });
      expect(request.messages[1]).toEqual({ role: 'user', content: 'Question' });
      expect(request.tools).toEqual([]);
    },
  );

  it('rejects an explicit empty override instead of silently falling back to the default', () => {
    expect(() => loadAgentConfig({ ...environment, AULA_SYSTEM_PROMPT: '' })).toThrow();
  });
});
