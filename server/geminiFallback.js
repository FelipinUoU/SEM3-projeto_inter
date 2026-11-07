function createDeadlineError() {
  const error = new Error('O prazo total da solicitação foi atingido.');
  error.status = 504;
  return error;
}

export async function generateWithProviderFallback({
  providers,
  requestDeadlineAt,
  providerTimeoutMs,
  maxAttempts,
  signal,
  generate,
  shouldRetry,
  waitBeforeRetry,
  onAttempt,
  onFailure,
  onSuccess
}) {
  let candidates = providers.map((provider) => ({ provider, attempt: 1 }));
  let lastError;

  while (candidates.length > 0) {
    const retryCandidates = [];
    for (let index = 0; index < candidates.length; index += 1) {
      if (signal?.aborted) {
        throw new DOMException('A solicitação foi cancelada.', 'AbortError');
      }

      const { provider, attempt } = candidates[index];
      const remainingMs = requestDeadlineAt - Date.now();
      if (remainingMs <= 0) throw createDeadlineError();

      const candidatesLeft = candidates.length - index;
      const timeoutMs = Math.max(
        1,
        Math.min(providerTimeoutMs, Math.floor(remainingMs / candidatesLeft))
      );
      onAttempt({ provider, attempt, timeoutMs, remainingMs });

      try {
        const result = await generate(provider, timeoutMs);
        onSuccess?.({ provider, attempt });
        return result;
      } catch (error) {
        if (signal?.aborted || error.name === 'AbortError') throw error;
        lastError = error;
        const willRetry = attempt < maxAttempts && shouldRetry(error);
        onFailure({ provider, attempt, error, willRetry });
        if (willRetry) retryCandidates.push({ provider, attempt: attempt + 1 });
      }
    }

    if (retryCandidates.length === 0) break;
    if (requestDeadlineAt - Date.now() <= 0) throw createDeadlineError();
    await waitBeforeRetry(signal);
    candidates = retryCandidates;
  }

  if (requestDeadlineAt - Date.now() <= 0) throw createDeadlineError();
  if (lastError) throw lastError;
  throw new Error('Nenhuma chave Gemini conseguiu processar a solicitação.');
}
