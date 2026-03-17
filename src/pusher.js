import { execFile } from 'node:child_process';
import { logger } from './logger.js';

function exec(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout.trim());
    });
  });
}

export async function push(repoDir) {
  try {
    const status = await exec('git', ['status', '--porcelain', 'data/', 'public/'], repoDir);
    if (!status) {
      logger.info('Push: no changes to commit');
      return;
    }

    const now = new Date();
    const msg = `update ${now.toISOString().slice(0, 10)} ${now.toISOString().slice(11, 16)}`;

    await exec('git', ['add', 'data/', 'public/'], repoDir);
    await exec('git', ['commit', '-m', msg], repoDir);
    await exec('git', ['push', 'origin', 'main'], repoDir);

    logger.info(`Push: committed and pushed "${msg}"`);
  } catch (err) {
    logger.warn(`Push failed: ${err.message}`);
  }
}
