import { describe, expect, it, vi } from 'vitest';
import {
  cleanupUserProfileAvatars,
  deleteImageKitFile,
  isImageKitNotFound,
  normalizeAccountPrefs
} from './index.js';

describe('profile avatar storage cleanup', () => {
  it('recognizes ImageKit 404 responses from $ResponseMetadata and FILE_NOT_FOUND reason', () => {
    const metadataError = {};
    Object.defineProperty(metadataError, '$ResponseMetadata', {
      value: { statusCode: 404 },
      enumerable: false
    });

    expect(isImageKitNotFound(metadataError)).toBe(true);
    expect(isImageKitNotFound({ reason: 'FILE_NOT_FOUND' })).toBe(true);
    expect(isImageKitNotFound({ statusCode: 500 })).toBe(false);
  });

  it('removes stale profileAvatarUrl and profileAvatarFileId when avatar is cleared', () => {
    expect(normalizeAccountPrefs({
      theme: 'dark',
      profileAvatarUrl: '',
      profileAvatarFileId: 'old-file-id'
    })).toEqual({
      theme: 'dark'
    });

    expect(normalizeAccountPrefs({
      theme: 'dark',
      profileAvatarUrl: 'https://ik.imagekit.io/demo/hokupedia/profiles/user-1/perfil.webp',
      profileAvatarFileId: 'new-file-id'
    })).toEqual({
      theme: 'dark',
      profileAvatarUrl: 'https://ik.imagekit.io/demo/hokupedia/profiles/user-1/perfil.webp',
      profileAvatarFileId: 'new-file-id'
    });
  });

  it('deletes previous and stale profile avatars while keeping the new fileId', async () => {
    const deletedIds = [];
    const client = {
      listFiles: vi.fn(async () => [
        {
          fileId: 'old-avatar-1',
          filePath: '/hokupedia/profiles/user-123/perfil_1.webp',
          url: 'https://ik.imagekit.io/demo/hokupedia/profiles/user-123/perfil_1.webp'
        },
        {
          fileId: 'new-avatar-2',
          filePath: '/hokupedia/profiles/user-123/perfil_2.webp',
          url: 'https://ik.imagekit.io/demo/hokupedia/profiles/user-123/perfil_2.webp'
        }
      ]),
      getFileDetails: vi.fn(async (fileId) => ({
        fileId,
        filePath: `/hokupedia/profiles/user-123/${fileId}.webp`,
        url: `https://ik.imagekit.io/demo/hokupedia/profiles/user-123/${fileId}.webp`
      })),
      deleteFile: vi.fn(async (fileId) => {
        deletedIds.push(fileId);
      })
    };

    const result = await cleanupUserProfileAvatars('user-123', {
      keepFileId: 'new-avatar-2',
      previousFileId: 'old-avatar-1',
      client,
      endpoint: 'https://ik.imagekit.io/demo'
    });

    expect(result).toEqual({
      deletedFileIds: ['old-avatar-1'],
      cleanupWarning: ''
    });
    expect(deletedIds).toEqual(['old-avatar-1']);
  });

  it('treats already deleted ImageKit files as non-errors during cleanup', async () => {
    const notFoundError = { message: 'The requested file does not exist.' };
    Object.defineProperty(notFoundError, '$ResponseMetadata', {
      value: { statusCode: 404 },
      enumerable: false
    });

    const client = {
      getFileDetails: vi.fn(async () => {
        throw notFoundError;
      }),
      deleteFile: vi.fn()
    };

    await expect(
      deleteImageKitFile('already-deleted-id', '/hokupedia/profiles/user-123/', undefined, client)
    ).resolves.toBe(false);
    expect(client.deleteFile).not.toHaveBeenCalled();
  });
});
