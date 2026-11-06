import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { getAvailablePort } from './index.js';

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
