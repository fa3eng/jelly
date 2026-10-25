import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { AgentClient } from '@jelly/contracts';

export interface ServiceConnection {
  baseUrl: string;
  authorizationToken: string;
}

export function createRpcClient(connection: ServiceConnection) {
  const lifetime = new AbortController();

  const link = new RPCLink({
    url: `${connection.baseUrl}/rpc`,
    headers: { Authorization: `Bearer ${connection.authorizationToken}` },
    // oRPC consumes Response.body as a stream and propagates AbortSignal cancellation.
    // Obsidian requestUrl buffers responses and cannot replace this transport.
    fetch: (request, init) =>
      fetch(request, {
        ...init,
        signal: AbortSignal.any([request.signal, lifetime.signal]),
      }),
  });
  const client: AgentClient = createORPCClient(link);

  return {
    client,
    close: () => lifetime.abort(),
  };
}
