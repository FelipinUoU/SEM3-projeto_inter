import { createHash } from 'crypto';
import sharp from 'sharp';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5000;
const MAX_GEMINI_DIMENSION = 1200;
const TRANSLATION_BATCH_SIZE = 8;
const cache = new Map();
const inFlight = new Map();

const analysisSchema = {
  type: 'OBJECT',
  properties: {
    detectedLanguage: { type: 'STRING' },
    bubbles: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          x: { type: 'INTEGER' },
          y: { type: 'INTEGER' },
          width: { type: 'INTEGER' },
          height: { type: 'INTEGER' },
          square: { type: 'BOOLEAN' },
          shape: { type: 'STRING', enum: ['oval', 'rect', 'action'] }
        },
        required: ['x', 'y', 'width', 'height', 'square', 'shape']
      }
    }
  },
  required: ['detectedLanguage', 'bubbles']
};

export function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

export function saveCache(key, value) {
  cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  return value;
}

export function clearTranslationCache() {
  cache.clear();
  inFlight.clear();
}

async function getOrLoad(key, loader) {
  const cached = getCache(key);
  if (cached !== undefined) return cached;
  if (inFlight.has(key)) return inFlight.get(key);

  const pending = Promise.resolve()
    .then(loader)
    .then((value) => saveCache(key, value))
    .finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

async function loadPersistedCheckpoints(keys, checkpointStore, log) {
  if (!checkpointStore || keys.length === 0) return new Map();
  try {
    if (checkpointStore.getMany) return await checkpointStore.getMany(keys);
    if (!checkpointStore.get) return new Map();
    const values = await Promise.all(keys.map(async (key) => [key, await checkpointStore.get(key)]));
    return new Map(values.filter(([, value]) => value !== undefined));
  } catch (error) {
    log('Falha ao carregar checkpoints persistidos', { mensagem: error.message });
    return new Map();
  }
}

async function persistCheckpoints(entries, checkpointStore, log) {
  entries.forEach(([key, value]) => saveCache(key, value));
  if (!checkpointStore || entries.length === 0) return;
  try {
    if (checkpointStore.setMany) {
      await checkpointStore.setMany(entries);
    } else if (checkpointStore.set) {
      await Promise.all(entries.map(([key, value]) => checkpointStore.set(key, value)));
    }
  } catch (error) {
    log('Falha ao salvar checkpoints persistidos', {
      quantidade: entries.length,
      mensagem: error.message
    });
  }
}

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function compressImage(buffer) {
  const output = await sharp(buffer, { failOn: 'error' })
    .rotate()
    .resize({
      width: MAX_GEMINI_DIMENSION,
      height: MAX_GEMINI_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true
    })
    .linear(1.04, -5)
    .sharpen({ sigma: 0.6 })
    .webp({ quality: 80, effort: 3, smartSubsample: true })
    .toBuffer();
  return output;
}

export async function resizeForGemini(buffer) {
  const metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Não foi possível identificar as dimensões da imagem enviada.');
  }
  return {
    buffer,
    width: metadata.width,
    height: metadata.height,
    mimeType: 'image/webp'
  };
}

function validateAnalysis(value) {
  if (!value || typeof value.detectedLanguage !== 'string' || !value.detectedLanguage.trim()
    || !Array.isArray(value.bubbles)) {
    throw new Error('A análise da página retornou um formato inválido.');
  }
  const bubbles = value.bubbles.map((bubble, index) => ({
      id: index + 1,
      x: bubble.x,
      y: bubble.y,
      width: bubble.width,
      height: bubble.height,
      square: bubble.square,
      shape: ['oval', 'rect', 'action'].includes(bubble.shape)
        ? bubble.shape
        : bubble.square ? 'rect' : 'oval'
    }));
  for (const bubble of bubbles) {
    if (![bubble.x, bubble.y, bubble.width, bubble.height].every(Number.isInteger)
      || bubble.x < 0 || bubble.y < 0 || bubble.width <= 0 || bubble.height <= 0
      || bubble.x + bubble.width > 1000 || bubble.y + bubble.height > 1000
      || typeof bubble.square !== 'boolean') {
      throw new Error(`A análise retornou coordenadas inválidas no balão ${bubble.id}.`);
    }
  }
  return { detectedLanguage: value.detectedLanguage.trim(), bubbles };
}

export async function detectTextRegions(image, generateJson, signal) {
  const result = await generateJson({
    parts: [
      {
        text: 'Identifique balões de fala e pensamento com texto legível; ignore quadros, legendas, efeitos sonoros e textos fora dos balões. Retorne caixas justas ao contorno do balão, sem caudas. Informe idioma, square e shape: oval, rect ou action (estouro/raios). Coordenadas inteiras de 0 a 1000 relativas à imagem.'
      },
      {
        inlineData: {
          mimeType: image.mimeType,
          data: image.buffer.toString('base64')
        }
      }
    ],
    responseSchema: analysisSchema,
    maxOutputTokens: 2048,
    signal
  });
  return validateAnalysis(JSON.parse(result));
}

export async function extractBubbleCrops(image, regions) {
  const crops = [];
  for (const region of regions) {
    const rawLeft = Math.floor((region.x / 1000) * image.width);
    const rawTop = Math.floor((region.y / 1000) * image.height);
    const rawRight = Math.ceil(((region.x + region.width) / 1000) * image.width);
    const rawBottom = Math.ceil(((region.y + region.height) / 1000) * image.height);
    const paddingX = Math.ceil((rawRight - rawLeft) * 0.06);
    const paddingY = Math.ceil((rawBottom - rawTop) * 0.06);
    const left = Math.max(0, rawLeft - paddingX);
    const top = Math.max(0, rawTop - paddingY);
    const right = Math.min(image.width, rawRight + paddingX);
    const bottom = Math.min(image.height, rawBottom + paddingY);
    const width = right - left;
    const height = bottom - top;
    if (width < 1 || height < 1) continue;

    const buffer = await sharp(image.buffer)
      .extract({ left, top, width, height })
      .webp({ quality: 80, effort: 3 })
      .toBuffer();
    crops.push({ id: region.id, buffer, hash: hash(buffer) });
  }
  return crops;
}

function normalizeLanguage(language) {
  const normalized = language.trim().toLocaleLowerCase();
  const aliases = new Map([
    ['ja', 'japanese'], ['日本語', 'japanese'], ['japonês', 'japanese'], ['japones', 'japanese'],
    ['pt', 'portuguese'], ['pt-br', 'portuguese'], ['português brasileiro', 'portuguese'],
    ['português', 'portuguese'], ['portugues', 'portuguese'],
    ['en', 'english'], ['inglês', 'english'], ['ingles', 'english'],
    ['es', 'spanish'], ['español', 'spanish'], ['espanhol', 'spanish'],
    ['ko', 'korean'], ['한국어', 'korean'], ['coreano', 'korean'],
    ['fr', 'french'], ['français', 'french'], ['francês', 'french']
  ]);
  return aliases.get(normalized) || normalized;
}

export async function translateBubbleText(text, targetLanguage, generateJson, signal) {
  const result = await generateJson({
    parts: [{
      text: `Traduza naturalmente para ${targetLanguage}, com fidelidade e sem acrescentar conteúdo. Retorne JSON {"text":"..."}: ${JSON.stringify(text)}`
    }],
    responseSchema: {
      type: 'OBJECT',
      properties: { text: { type: 'STRING' } },
      required: ['text']
    },
    maxOutputTokens: Math.min(256, Math.max(64, Math.ceil(text.length * 2))),
    signal
  });
  const parsed = JSON.parse(result);
  if (typeof parsed.text !== 'string' || !parsed.text.trim()) {
    throw new Error('Gemini retornou uma tradução vazia.');
  }
  return parsed.text.trim();
}

async function translateBatch(batch, crops, targetLanguage, detectedLanguage, alreadyTargetLanguage, generateJson, signal) {
  const responseSchema = {
    type: 'OBJECT',
    properties: {
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            id: { type: 'INTEGER' },
            originalText: { type: 'STRING' },
            ...(!alreadyTargetLanguage ? { translation: { type: 'STRING' } } : {})
          },
          required: alreadyTargetLanguage
            ? ['id', 'originalText']
            : ['id', 'originalText', 'translation']
        }
      }
    },
    required: ['items']
  };
  const result = await generateJson({
    parts: [
      {
        text: alreadyTargetLanguage
          ? `Transcreva somente o texto legível de cada crop. O idioma já é ${targetLanguage}; não traduza nem invente. Retorne JSON {"items":[{"id":1,"originalText":"..."}]} na ordem dos ids.`
          : `Leia o texto de cada crop e traduza para ${targetLanguage}. Idioma de origem: ${detectedLanguage}. Seja natural e fiel, sem resumir ou inventar. Retorne JSON {"items":[{"id":1,"originalText":"...","translation":"..."}]} na ordem dos ids.`
      },
      ...batch.flatMap(({ id }) => [
        { text: `id ${id}` },
        { inlineData: { mimeType: 'image/webp', data: crops.get(id).buffer.toString('base64') } }
      ])
    ],
    responseSchema,
    maxOutputTokens: Math.min(2048, Math.max(256, batch.length * 180)),
    signal
  });
  const parsed = JSON.parse(result);
  if (!Array.isArray(parsed.items)) throw new Error('Gemini retornou uma lista de balões inválida.');
  const translations = new Map();
  for (const item of parsed.items) {
    if (!batch.some((bubble) => bubble.id === item.id)
      || translations.has(item.id)
      || typeof item.originalText !== 'string'
      || !item.originalText.trim()
      || (!alreadyTargetLanguage && (typeof item.translation !== 'string' || !item.translation.trim()))) {
      throw new Error('Gemini retornou texto de balão incompleto ou inválido.');
    }
    const originalText = item.originalText.trim();
    translations.set(item.id, {
      originalText,
      translation: alreadyTargetLanguage ? originalText : item.translation.trim()
    });
  }
  if (translations.size !== batch.length) throw new Error('Gemini não processou todos os balões solicitados.');
  return translations;
}

export async function processMangaPage({
  buffer,
  targetLanguage,
  generateJson,
  signal,
  suppliedAnalysis,
  requestId: suppliedRequestId,
  checkpointStore
}) {
  if (typeof targetLanguage !== 'string' || !targetLanguage.trim()) {
    throw new Error('Informe o idioma de destino.');
  }
  const startedAt = Date.now();
  const imageHash = hash(buffer);
  const requestId = suppliedRequestId || imageHash.slice(0, 12);
  const log = (stage, details = {}) => {
    console.info(`[HokuPédia IA][${requestId}] ${stage}`, details);
  };
  log('Preparando imagem', { bytesOriginais: buffer.length });
  const prepared = await compressImage(buffer);
  const geminiImage = await resizeForGemini(prepared);
  log('Imagem preparada', {
    largura: geminiImage.width,
    altura: geminiImage.height,
    bytesPreparados: prepared.length
  });
  let analysis;
  if (suppliedAnalysis) {
    log('Reutilizando análise fornecida');
    analysis = validateAnalysis(suppliedAnalysis);
  } else {
    const analysisKey = `manga:analysis:${imageHash}`;
    let cachedAnalysis = getCache(analysisKey);
    if (cachedAnalysis === undefined) {
      const persisted = await loadPersistedCheckpoints([analysisKey], checkpointStore, log);
      cachedAnalysis = persisted.get(analysisKey);
      if (cachedAnalysis !== undefined) {
        cachedAnalysis = validateAnalysis(cachedAnalysis);
        saveCache(analysisKey, cachedAnalysis);
        log('Análise de balões recuperada do checkpoint persistido');
      }
    }
    if (cachedAnalysis) {
      log('Análise de balões recuperada do cache');
      analysis = cachedAnalysis;
    } else {
      log(inFlight.has(analysisKey)
        ? 'Aguardando análise de balões em andamento'
        : 'Enviando imagem reduzida para detectar balões');
      analysis = await getOrLoad(analysisKey, () => detectTextRegions(geminiImage, generateJson, signal));
      await persistCheckpoints([[analysisKey, analysis]], checkpointStore, log);
    }
  }
  log('Detecção de balões concluída', {
    idiomaDetectado: analysis.detectedLanguage,
    baloesEncontrados: analysis.bubbles.length
  });
  const cropList = await extractBubbleCrops(geminiImage, analysis.bubbles);
  const crops = new Map(cropList.map((crop) => [crop.id, crop]));
  log('Crops de balões preparados', {
    baloesDetectados: analysis.bubbles.length,
    cropsExtraidos: cropList.length,
    bytesDosCrops: cropList.reduce((total, crop) => total + crop.buffer.length, 0)
  });
  const target = targetLanguage.trim();
  const alreadyTargetLanguage = normalizeLanguage(analysis.detectedLanguage)
    === normalizeLanguage(target);
  const result = analysis.bubbles.filter(({ id }) => crops.has(id)).map((bubble) => ({
    ...bubble,
    originalText: '',
    translation: ''
  }));
  let pending = [];
  let cacheHits = 0;

  for (const bubble of result) {
    const crop = crops.get(bubble.id);
    if (!crop) continue;
    const cacheKey = `manga:translation:${imageHash}:${target}:${bubble.id}:${crop.hash}`;
    const cached = getCache(cacheKey);
    if (cached) {
      bubble.originalText = cached.originalText;
      bubble.translation = cached.translation;
      cacheHits += 1;
    } else {
      bubble.cacheKey = cacheKey;
      pending.push(bubble);
    }
  }

  const persistedTranslations = await loadPersistedCheckpoints(
    pending.map((bubble) => bubble.cacheKey),
    checkpointStore,
    log
  );
  pending = pending.filter((bubble) => {
    const cached = persistedTranslations.get(bubble.cacheKey);
    if (!cached || typeof cached.originalText !== 'string'
      || typeof cached.translation !== 'string') return true;
    bubble.originalText = cached.originalText;
    bubble.translation = cached.translation;
    saveCache(bubble.cacheKey, cached);
    cacheHits += 1;
    return false;
  });

  log(alreadyTargetLanguage
    ? 'Idioma detectado é o idioma de destino; somente transcrição será executada'
    : 'Verificação de cache das traduções concluída', {
    idiomaDestino: target,
    cacheHits,
    baloesPendentes: pending.length
  });
  const batchCount = Math.ceil(pending.length / TRANSLATION_BATCH_SIZE);
  for (let offset = 0; offset < pending.length; offset += TRANSLATION_BATCH_SIZE) {
    const batch = pending.slice(offset, offset + TRANSLATION_BATCH_SIZE);
    log(alreadyTargetLanguage
      ? 'Transcrevendo crops sem traduzir'
      : 'Traduzindo lote de balões', {
      lote: Math.floor(offset / TRANSLATION_BATCH_SIZE) + 1,
      totalLotes: batchCount,
      baloesNoLote: batch.length
    });
    const translations = await getOrLoad(
      `manga:batch:${imageHash}:${target}:${batch.map((bubble) => `${bubble.id}:${crops.get(bubble.id).hash}`).join(',')}`,
      () => translateBatch(batch, crops, target, analysis.detectedLanguage, alreadyTargetLanguage, generateJson, signal)
    );
    const completedCheckpoints = [];
    for (const bubble of batch) {
      const translated = translations.get(bubble.id);
      bubble.originalText = translated.originalText;
      bubble.translation = translated.translation;
      completedCheckpoints.push([bubble.cacheKey, translated]);
    }
    await persistCheckpoints(completedCheckpoints, checkpointStore, log);
    log('Lote concluído', {
      lote: Math.floor(offset / TRANSLATION_BATCH_SIZE) + 1,
      totalLotes: batchCount
    });
  }

  log('Página processada', {
    baloesTraduzidos: result.length,
    cacheHits,
    duracaoMs: Date.now() - startedAt
  });
  return {
    detectedLanguage: analysis.detectedLanguage,
    bubbles: result.map((bubble) => {
      const output = { ...bubble };
      delete output.cacheKey;
      return output;
    })
  };
}
