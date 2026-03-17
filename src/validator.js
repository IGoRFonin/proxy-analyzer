const VALID_TRANSPORTS = ['tcp', 'xhttp', 'socks5', 'http'];
const NAME_REGEX = /^[a-zA-Z0-9-]+$/;
const URL_REGEX = /^(http|socks5):\/\/.+/;

export function validate(content) {
  const errors = [];
  const proxies = [];
  const seenNames = new Set();
  const seenUrls = new Set();

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const lineNum = i + 1;
    const parts = line.split('|');

    if (parts.length !== 3) {
      errors.push(`Line ${lineNum}: expected 3 fields separated by |, got ${parts.length}`);
      continue;
    }

    const [transport, name, url] = parts.map(p => p.trim());

    if (!VALID_TRANSPORTS.includes(transport)) {
      errors.push(`Line ${lineNum}: invalid transport "${transport}" (expected: ${VALID_TRANSPORTS.join(', ')})`);
    }

    if (!name || !NAME_REGEX.test(name)) {
      errors.push(`Line ${lineNum}: invalid name "${name}" (allowed: a-zA-Z0-9-)`);
    } else if (seenNames.has(name)) {
      errors.push(`Line ${lineNum}: duplicate name "${name}"`);
    } else {
      seenNames.add(name);
    }

    if (!URL_REGEX.test(url)) {
      errors.push(`Line ${lineNum}: invalid url "${url}" (must start with http:// or socks5://)`);
    } else if (seenUrls.has(url)) {
      errors.push(`Line ${lineNum}: duplicate url "${url}"`);
    } else {
      seenUrls.add(url);
    }

    proxies.push({ transport, name, proxy: url });
  }

  if (errors.length === 0 && proxies.length === 0) {
    errors.push('at least one proxy must be defined');
  }

  if (errors.length > 0) {
    return { ok: false, errors, proxies: [] };
  }

  return { ok: true, errors: [], proxies };
}
