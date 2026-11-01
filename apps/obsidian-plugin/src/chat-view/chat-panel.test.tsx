import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatPanel } from '@jelly/ui';

describe('Chat presentation', () => {
  it('keeps conversation updates accessible and defers streaming announcements', () => {
    const html = renderToStaticMarkup(
      <ChatPanel messages={[]} status="streaming" onSubmit={() => {}} onInterrupt={() => {}} />,
    );
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
  });

  it('renders compact source anchors without duplicating source text and enables reference-only submission', () => {
    const html = renderToStaticMarkup(
      <ChatPanel
        messages={[
          {
            id: 'question',
            role: 'user',
            content: '',
            references: [
              {
                id: 'quote',
                path: 'Agent.md',
                text: '<script>bad()</script>',
                question: '这是什么意思？',
                from: { line: 0, ch: 0 },
                to: { line: 0, ch: 10 },
              },
            ],
          },
        ]}
        status="idle"
        onSubmit={() => {}}
        onInterrupt={() => {}}
        canSubmitWithoutPrompt
      />,
    );
    expect(html).toContain('Agent · L1');
    expect(html).not.toContain('bad()');
    expect(html).not.toContain('<summary>');
    expect(html).not.toContain('<blockquote>');
    expect(html).toContain('这是什么意思？');
    expect(html).not.toContain('disabled=""');
  });

  it('renders assistant content through the host slot while keeping user input literal', () => {
    const html = renderToStaticMarkup(
      <ChatPanel
        messages={[
          { id: 'user', role: 'user', content: '<b>user text</b>' },
          { id: 'assistant', role: 'assistant', content: '**assistant**' },
        ]}
        status="idle"
        onSubmit={() => {}}
        onInterrupt={() => {}}
        renderAssistant={() => <strong>host-rendered reply</strong>}
      />,
    );
    expect(html).toContain('&lt;b&gt;user text&lt;/b&gt;');
    expect(html).toContain('<strong>host-rendered reply</strong>');
    expect(html).not.toContain('**assistant**');
    expect(html).toContain('aria-busy="false"');
  });
});
