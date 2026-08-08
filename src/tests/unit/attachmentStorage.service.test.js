const path = require('path');
const {
  getAttachmentStorageRoot,
  validateAttachmentStorage
} = require('../../services/attachmentStorage.service');

describe('attachmentStorage service', () => {
  const absoluteRoot = path.resolve('test-persistent-attachments');

  test('requires an explicitly configured production root', () => {
    expect(() => getAttachmentStorageRoot({
      env: {},
      environment: 'production'
    })).toThrow(expect.objectContaining({ code: 'ATTACHMENT_STORAGE_ROOT_REQUIRED' }));
  });

  test('rejects relative and filesystem-root production paths', () => {
    expect(() => getAttachmentStorageRoot({
      env: { ATTACHMENT_STORAGE_ROOT: 'attachments' },
      environment: 'production'
    })).toThrow(expect.objectContaining({ code: 'ATTACHMENT_STORAGE_ROOT_NOT_ABSOLUTE' }));

    expect(() => getAttachmentStorageRoot({
      env: { ATTACHMENT_STORAGE_ROOT: path.parse(absoluteRoot).root },
      environment: 'production'
    })).toThrow(expect.objectContaining({ code: 'ATTACHMENT_STORAGE_ROOT_UNSAFE' }));
  });

  test('validates directory access without creating or deleting a probe file', async () => {
    const fsImpl = {
      stat: jest.fn().mockResolvedValue({ isDirectory: () => true }),
      access: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn(),
      writeFile: jest.fn(),
      rm: jest.fn()
    };

    const result = await validateAttachmentStorage({
      env: { ATTACHMENT_STORAGE_ROOT: absoluteRoot },
      environment: 'production',
      fsImpl
    });

    expect(result.ready).toBe(true);
    expect(fsImpl.stat).toHaveBeenCalledWith(absoluteRoot);
    expect(fsImpl.access).toHaveBeenCalledTimes(1);
    expect(fsImpl.mkdir).not.toHaveBeenCalled();
    expect(fsImpl.writeFile).not.toHaveBeenCalled();
    expect(fsImpl.rm).not.toHaveBeenCalled();
  });

  test('fails when the configured path is not a writable directory', async () => {
    await expect(validateAttachmentStorage({
      env: { ATTACHMENT_STORAGE_ROOT: absoluteRoot },
      environment: 'production',
      fsImpl: {
        stat: jest.fn().mockResolvedValue({ isDirectory: () => false }),
        access: jest.fn()
      }
    })).rejects.toMatchObject({ code: 'ATTACHMENT_STORAGE_NOT_DIRECTORY' });

    await expect(validateAttachmentStorage({
      env: { ATTACHMENT_STORAGE_ROOT: absoluteRoot },
      environment: 'production',
      fsImpl: {
        stat: jest.fn().mockResolvedValue({ isDirectory: () => true }),
        access: jest.fn().mockRejectedValue(new Error('denied'))
      }
    })).rejects.toMatchObject({ code: 'ATTACHMENT_STORAGE_NOT_WRITABLE' });
  });
});
