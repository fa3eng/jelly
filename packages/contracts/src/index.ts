import { oc, eventIterator, type ContractRouterClient } from '@orpc/contract';
import { z } from 'zod';

const sessionIdInput = z.object({ sessionId: z.uuid() });
const sessionSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  updatedAt: z.iso.datetime(),
});
const runViewSchema = z.object({
  id: z.uuid(),
  status: z.enum(['running', 'completed', 'cancelled', 'interrupted', 'error']),
  userText: z.string(),
  assistantText: z.string(),
});
const sessionViewSchema = sessionSummarySchema.extend({ runs: z.array(runViewSchema) });

export const chatGenerateInputSchema = z.object({
  sessionId: z.uuid(),
  runId: z.uuid(),
  prompt: z.string().trim().min(1),
});
export const chatGenerateOutputSchema = z.object({ text: z.string() });
export const chatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text-delta'), delta: z.string() }),
  z.object({ type: z.literal('tool-started'), callId: z.string(), name: z.string() }),
  z.object({
    type: z.literal('tool-finished'),
    callId: z.string(),
    name: z.string(),
    ok: z.boolean(),
  }),
  z.object({ type: z.literal('done') }),
]);

export const agentContract = {
  sessions: {
    create: oc
      .input(z.object({ title: z.string().trim().min(1) }))
      .output(z.object({ id: z.uuid() })),
    list: oc.input(z.object({})).output(z.array(sessionSummarySchema)),
    read: oc.input(sessionIdInput).output(sessionViewSchema),
  },
  chat: {
    generate: oc.input(chatGenerateInputSchema).output(chatGenerateOutputSchema),
    stream: oc.input(chatGenerateInputSchema).output(eventIterator(chatStreamEventSchema)),
  },
};

export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type SessionView = z.infer<typeof sessionViewSchema>;
export type ChatGenerateInput = z.infer<typeof chatGenerateInputSchema>;
export type ChatGenerateOutput = z.infer<typeof chatGenerateOutputSchema>;
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
export type AgentClient = ContractRouterClient<typeof agentContract>;
