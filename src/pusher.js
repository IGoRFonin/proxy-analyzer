import { execFile } from 'node:child_process';
import { logger } from './logger.js';

function exec(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout.trim());
    });
  });
}

/**
 * Sync data/ and public/ to the remote server via rsync.
 *
 * Expects env vars:
 *   SYNC_TARGET  — user@host:/path/to/app-data
 *   SYNC_KEY     — (optional) path to SSH private key
 */
export async function push(repoDir) {
  const target = process.env.SYNC_TARGET;
  if (!target) {
    logger.warn('Push: SYNC_TARGET not set, skipping');
    return;
  }

  const sshArgs = process.env.SYNC_KEY
    ? `-e "ssh -i ${process.env.SYNC_KEY} -o StrictHostKeyChecking=no"`
    : '-e "ssh -o StrictHostKeyChecking=no"';

  try {
    await exec('rsync', [
      '-az', '--delete',
      ...sshArgs.split(' '),
      `${repoDir}/data/`,
      `${target}/data/`,
    ]);

    await exec('rsync', [
      '-az', '--delete',
      ...sshArgs.split(' '),
      `${repoDir}/public/`,
      `${target}/public/`,
    ]);

    logger.info(`Push: synced data and public to ${target}`);
  } catch (err) {
    logger.warn(`Push failed: ${err.message}`);
  }
}
