export async function invokeLibrary(client, action, payload) {
  if (!client) throw new Error('missingConfig');
  const { data, error } = await client.functions.invoke('library', {
    body: { action, payload },
  });
  if (error) {
    const failure = await error.context?.json?.().catch(() => null);
    throw new Error(typeof failure?.error === 'string' ? failure.error : 'server');
  }
  if (typeof data?.error === 'string') throw new Error(data.error);
  if (!data || typeof data !== 'object') throw new Error('server');
  return data;
}

export function createRoomConnection() {
  const clientId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let generation = 0;
  return {
    advance() { generation++; },
    payload() { return { clientId, generation }; },
  };
}
