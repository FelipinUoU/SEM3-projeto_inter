import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  clearTranslationCache,
  processMangaPage,
  saveCache,
  getCache
} from './mangaTranslation.js';

async function createPage(background = '#d8d8d8') {
  const svg = Buffer.from(`
    <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="300" fill="${background}"/>
      <ellipse cx="180" cy="120" rx="80" ry="45" fill="white" stroke="black"/>
    </svg>
  `);
  return sharp(svg).png().toBuffer();
}

describe('manga translation pipeline', () => {
  it('detects regions once, translates cropped images and reuses the result cache', async () => {
    const buffer = await createPage();
    const generateJson = vi.fn(async ({ parts }) => {
      if (parts[0].text.startsWith('Identifique')) {
        return JSON.stringify({
          detectedLanguage: 'Japanese',
          bubbles: [{ x: 250, y: 250, width: 400, height: 300, square: false, shape: 'oval' }]
        });
      }
      expect(parts.filter((part) => part.inlineData)).toHaveLength(1);
      const crop = await sharp(Buffer.from(parts.find((part) => part.inlineData).inlineData.data, 'base64'))
        .metadata();
      expect(crop.width).toBeLessThan(400);
      expect(crop.height).toBeLessThan(300);
      return JSON.stringify({
        items: [{ id: 1, originalText: 'こんにちは', translation: 'Olá' }]
      });
    });

    const first = await processMangaPage({
      buffer,
      targetLanguage: 'Português brasileiro',
      generateJson
    });
    expect(first).toEqual({
      detectedLanguage: 'Japanese',
      bubbles: [{
        id: 1,
        x: 250,
        y: 250,
        width: 400,
        height: 300,
        square: false,
        shape: 'oval',
        originalText: 'こんにちは',
        translation: 'Olá'
      }]
    });
    expect(generateJson).toHaveBeenCalledTimes(2);

    const second = await processMangaPage({
      buffer,
      targetLanguage: 'Português brasileiro',
      generateJson: vi.fn(() => {
        throw new Error('O cache deveria evitar novas chamadas ao modelo.');
      })
    });
    expect(second).toEqual(first);
  });

  it('transcribes but does not translate when the page is already in the target language', async () => {
    const buffer = await createPage('#d7d0d0');
    const generateJson = vi.fn(async ({ parts }) => {
      expect(parts[0].text).toContain('não traduza');
      expect(parts.filter((part) => part.inlineData)).toHaveLength(1);
      return JSON.stringify({ items: [{ id: 1, originalText: 'こんにちは' }] });
    });
    const result = await processMangaPage({
      buffer,
      targetLanguage: '日本語',
      suppliedAnalysis: {
        detectedLanguage: 'ja',
        bubbles: [{ x: 250, y: 250, width: 400, height: 300, square: false }]
      },
      generateJson
    });

    expect(result.bubbles[0].translation).toBe('こんにちは');
    expect(generateJson).toHaveBeenCalledTimes(1);
  });

  it('preserves action-balloon shape metadata for the reader overlay', async () => {
    const result = await processMangaPage({
      buffer: await createPage('#d4d0d0'),
      targetLanguage: 'Português brasileiro',
      suppliedAnalysis: {
        detectedLanguage: 'English',
        bubbles: [{ x: 250, y: 250, width: 400, height: 300, square: true, shape: 'action' }]
      },
      generateJson: vi.fn(async () => JSON.stringify({
        items: [{ id: 1, originalText: 'BANG!', translation: 'POW!' }]
      }))
    });

    expect(result.bubbles[0].shape).toBe('action');
    expect(result.bubbles[0].translation).toBe('POW!');
  });

  it('resumes at the first unfinished bubble batch after the memory cache is cleared', async () => {
    clearTranslationCache();
    const checkpoints = new Map();
    const checkpointStore = {
      get: async (key) => checkpoints.get(key),
      getMany: async (keys) => new Map(keys
        .filter((key) => checkpoints.has(key))
        .map((key) => [key, checkpoints.get(key)])),
      setMany: async (entries) => entries.forEach(([key, value]) => checkpoints.set(key, value))
    };
    const buffer = await createPage('#d3d1d1');
    let firstRequestBatch = 0;
    const generateJson = vi.fn(async ({ parts }) => {
      if (parts[0].text.startsWith('Identifique')) {
        return JSON.stringify({
          detectedLanguage: 'Japanese',
          bubbles: Array.from({ length: 9 }, () => ({
            x: 250,
            y: 250,
            width: 400,
            height: 300,
            square: false,
            shape: 'oval'
          }))
        });
      }
      firstRequestBatch += 1;
      if (firstRequestBatch === 2) throw new Error('Simulated interruption after the first batch.');
      const ids = parts
        .filter((part) => part.text?.startsWith('id '))
        .map((part) => Number(part.text.slice(3)));
      return JSON.stringify({
        items: ids.map((id) => ({
          id,
          originalText: `Texto ${id}`,
          translation: `Tradução ${id}`
        }))
      });
    });
    await expect(processMangaPage({
      buffer,
      targetLanguage: 'Italiano',
      generateJson,
      checkpointStore
    })).rejects.toThrow('Simulated interruption');
    expect(generateJson).toHaveBeenCalledTimes(3);
    expect(checkpoints.size).toBe(9);

    clearTranslationCache();
    const generateAfterRestart = vi.fn(async ({ parts }) => {
      const ids = parts
        .filter((part) => part.text?.startsWith('id '))
        .map((part) => Number(part.text.slice(3)));
      expect(ids).toEqual([9]);
      return JSON.stringify({
        items: [{ id: 9, originalText: 'Texto 9', translation: 'Tradução 9' }]
      });
    });
    const resumed = await processMangaPage({
      buffer,
      targetLanguage: 'Italiano',
      generateJson: generateAfterRestart,
      checkpointStore
    });

    expect(resumed.bubbles).toHaveLength(9);
    expect(resumed.bubbles.slice(0, 8).map((bubble) => bubble.translation))
      .toEqual(Array.from({ length: 8 }, (_, index) => `Tradução ${index + 1}`));
    expect(resumed.bubbles[8].translation).toBe('Tradução 9');
    expect(generateAfterRestart).toHaveBeenCalledTimes(1);
  });

  it('expires cache values and stores current values', () => {
    vi.useFakeTimers();
    const now = Date.now();
    saveCache('test:cache', 'saved');
    expect(getCache('test:cache')).toBe('saved');
    vi.setSystemTime(now + 31 * 24 * 60 * 60 * 1000);
    expect(getCache('test:cache')).toBeUndefined();
    vi.useRealTimers();
  });
});
