const fs = require('fs/promises');
const { constants: fsConstants } = require('fs');
const os = require('os');
const path = require('path');

class AttachmentStorageError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AttachmentStorageError';
    this.code = code;
  }
}

function getAttachmentStorageRoot({
  env = process.env,
  environment = env.NODE_ENV,
  cwd = process.cwd(),
  tmpdir = os.tmpdir()
} = {}) {
  const configuredRoot = String(env.ATTACHMENT_STORAGE_ROOT || '').trim();

  if (!configuredRoot) {
    if (environment === 'production') {
      throw new AttachmentStorageError(
        'Production attachment storage must be explicitly configured.',
        'ATTACHMENT_STORAGE_ROOT_REQUIRED'
      );
    }

    if (environment === 'test') {
      return path.join(tmpdir, 'vinagent-test-attachments');
    }

    return path.resolve(cwd, 'uploads', 'attachments');
  }

  if (environment === 'production' && !path.isAbsolute(configuredRoot)) {
    throw new AttachmentStorageError(
      'Production attachment storage must use an absolute path.',
      'ATTACHMENT_STORAGE_ROOT_NOT_ABSOLUTE'
    );
  }

  const resolvedRoot = path.resolve(cwd, configuredRoot);
  if (environment === 'production' && resolvedRoot === path.parse(resolvedRoot).root) {
    throw new AttachmentStorageError(
      'The filesystem root cannot be used for attachment storage.',
      'ATTACHMENT_STORAGE_ROOT_UNSAFE'
    );
  }

  return resolvedRoot;
}

async function validateAttachmentStorage({
  env = process.env,
  environment = env.NODE_ENV,
  cwd = process.cwd(),
  tmpdir = os.tmpdir(),
  fsImpl = fs
} = {}) {
  const root = getAttachmentStorageRoot({ env, environment, cwd, tmpdir });

  let stats;
  try {
    stats = await fsImpl.stat(root);
  } catch (error) {
    throw new AttachmentStorageError(
      'The configured attachment storage directory does not exist or cannot be inspected.',
      'ATTACHMENT_STORAGE_UNAVAILABLE'
    );
  }

  if (!stats.isDirectory()) {
    throw new AttachmentStorageError(
      'The configured attachment storage path is not a directory.',
      'ATTACHMENT_STORAGE_NOT_DIRECTORY'
    );
  }

  try {
    // This deliberately performs an access check only. Startup and preflight
    // must never create, overwrite, or remove a customer attachment probe.
    await fsImpl.access(root, fsConstants.R_OK | fsConstants.W_OK);
  } catch (error) {
    throw new AttachmentStorageError(
      'The configured attachment storage directory is not readable and writable.',
      'ATTACHMENT_STORAGE_NOT_WRITABLE'
    );
  }

  return { ready: true, root };
}

module.exports = {
  AttachmentStorageError,
  getAttachmentStorageRoot,
  validateAttachmentStorage
};
