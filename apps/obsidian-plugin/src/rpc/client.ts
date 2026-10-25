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
