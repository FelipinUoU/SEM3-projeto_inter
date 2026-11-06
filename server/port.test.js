import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { NEON_COLLECTION_IDS, getAvailablePort } from './index.js';

describe('server port selection', () => {
  it('skips occupied ports and returns a free port', async () => {
    const occupiedServer = createServer();
    await new Promise((resolve) => occupiedServer.listen(0, resolve));
    const occupiedPort = occupiedServer.address().port;

    const nextPort = await getAvailablePort(occupiedPort, 5);

    expect(nextPort).toBeGreaterThanOrEqual(occupiedPort + 1);

    const probeServer = createServer();
    await new Promise((resolve) => probeServer.listen(nextPort, resolve));
    await new Promise((resolve, reject) => {
      probeServer.close((error) => (error ? reject(error) : resolve()));
    });
    await new Promise((resolve, reject) => {
      occupiedServer.close((error) => (error ? reject(error) : resolve()));
    });
  });
});

describe('neon collection mapping', () => {
  it('exposes the Neon collection ids used by the server', () => {
    expect(NEON_COLLECTION_IDS).toMatchObject({
      works: 'obras',
      chapters: 'capitulos',
      pages: 'paginas',
      moderationRequests: 'pedido_moderacao',
      workRequests: 'pedido_obra'
    });
  });
});
