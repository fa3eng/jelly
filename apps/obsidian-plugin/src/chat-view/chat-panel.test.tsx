import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatPanel } from '@aula/ui';

describe('Chat presentation', () => {
  it('keeps conversation updates accessible and defers streaming announcements', () => {
    const html = renderToStaticMarkup(
      <ChatPanel messages={[]} status="streaming" onSubmit={() => {}} onInterrupt={() => {}} />,
    );
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
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
