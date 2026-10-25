import { z } from 'zod';

const functionCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal('function'),
  function: z.object({ name: z.string().min(1), arguments: z.string() }),
});

// 对应当前 Runtime 已支持的文字消息与函数工具调用。
export const messageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), content: z.string() }),
  z.object({
    role: z.literal('assistant'),
    content: z.string(),
    tool_calls: z.array(functionCallSchema).optional(),
  }),
  z.object({
    role: z.literal('tool'),
    tool_call_id: z.string().min(1),
    content: z.string(),
  }),
]);

export const finishedStatusSchema = z.enum(['completed', 'cancelled', 'interrupted', 'error']);

export const recordSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session-created'),
    version: z.literal(1),
    sessionId: z.uuid(),
    title: z.string().min(1),
    at: z.iso.datetime(),
  }),
  z.object({ type: z.literal('run-started'), runId: z.uuid(), at: z.iso.datetime() }),
  z.object({
    type: z.literal('message-added'),
    runId: z.uuid(),
    message: messageSchema,
    at: z.iso.datetime(),
  }),
  z.object({
    type: z.literal('run-finished'),
    runId: z.uuid(),
    status: finishedStatusSchema,
    at: z.iso.datetime(),
  }),
]);

export type SessionRecord = z.infer<typeof recordSchema>;
export type StoredMessage = z.infer<typeof messageSchema>;
export type FinishedStatus = z.infer<typeof finishedStatusSchema>;
