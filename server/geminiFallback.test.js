import { describe, expect, it, vi } from 'vitest';
import { generateWithProviderFallback } from './geminiFallback.js';

describe('Gemini provider fallback', () => {
  it('tries every provider before retrying transient failures', async () => {
    const providers = ['key-1', 'key-2', 'key-3'].map((name) => ({ name }));
    const calls = [];
    const result = await generateWithProviderFallback({
      providers,
      requestDeadlineAt: Date.now() + 10000,
      providerTimeoutMs: 1000,
      maxAttempts: 2,
      generate: vi.fn(async (provider, timeoutMs) => {
        calls.push({ provider: provider.name, timeoutMs });
        if (provider.name === 'key-2') return 'success';
        const error = new Error('temporarily unavailable');
        error.status = 503;
        throw error;
      }),
      shouldRetry: (error) => error.status === 503,
      waitBeforeRetry: vi.fn(async () => {}),
      onAttempt: vi.fn(),
      onFailure: vi.fn(),
      onSuccess: vi.fn()
    });

    expect(result).toBe('success');
    expect(calls.map(({ provider }) => provider)).toEqual(['key-1', 'key-2']);
  });

  it('starts the retry round only after all providers have had a first attempt', async () => {
    const providers = ['key-1', 'key-2', 'key-3'].map((name) => ({ name }));
    const calls = [];
    await generateWithProviderFallback({
      providers,
      requestDeadlineAt: Date.now() + 10000,
      providerTimeoutMs: 1000,
      maxAttempts: 2,
      generate: async (provider) => {
        calls.push(provider.name);
        if (calls.length === 5) return 'success';
        const error = new Error('temporarily unavailable');
        error.status = 503;
        throw error;
      },
      shouldRetry: (error) => error.status === 503,
      waitBeforeRetry: async () => {},
      onAttempt: () => {},
      onFailure: () => {},
      onSuccess: () => {}
    });

    expect(calls).toEqual(['key-1', 'key-2', 'key-3', 'key-1', 'key-2']);
  });

  it('divides the remaining deadline across providers in the current round', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const providers = ['key-1', 'key-2', 'key-3'].map((name) => ({ name }));
    const timeouts = [];
    const error = new Error('provider failed');
    error.status = 400;

    const request = generateWithProviderFallback({
      providers,
      requestDeadlineAt: start + 300,
      providerTimeoutMs: 1000,
      maxAttempts: 1,
      generate: async (_provider, timeoutMs) => {
        timeouts.push(timeoutMs);
        vi.setSystemTime(start + timeouts.length * 100);
        throw error;
      },
      shouldRetry: () => false,
      waitBeforeRetry: async () => {},
      onAttempt: () => {},
      onFailure: () => {},
      onSuccess: () => {}
    });

    try {
      await expect(request).rejects.toMatchObject({ status: 504 });
      expect(timeouts).toEqual([100, 100, 100]);
    } finally {
      vi.useRealTimers();
    }
  });
});
