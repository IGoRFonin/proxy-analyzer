const LEVELS = { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' };

function log(level, message) {
  const time = new Date().toISOString();
  const prefix = `[${time}] [${level}]`;
  if (level === LEVELS.ERROR) {
    console.error(`${prefix} ${message}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logger = {
  info: (msg) => log(LEVELS.INFO, msg),
  warn: (msg) => log(LEVELS.WARN, msg),
  error: (msg) => log(LEVELS.ERROR, msg),
};
