const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, '');

const ensureHashPath = (value: string) => {
  if (!value) {
    return '#/';
  }

  if (value.startsWith('#')) {
    return value;
  }

  return value.startsWith('/') ? `#${value}` : `#/${value}`;
};

export const buildQortalShareLink = (hashPath: string) => {
  if (typeof window === 'undefined') {
    return '';
  }

  const qortalWindow = window as Window & { _qdnBase?: string };
  const qdnBase = qortalWindow._qdnBase;
  const normalizedHashPath = ensureHashPath(hashPath);

  if (typeof qdnBase === 'string' && qdnBase.startsWith('/render/')) {
    const qdnSegments = trimSlashes(qdnBase).split('/');
    const sharePath = qdnSegments.slice(1).join('/');
    return `qortal://${sharePath}/${normalizedHashPath}`;
  }

  return `${window.location.origin}${window.location.pathname}${normalizedHashPath}`;
};

export const copyToClipboard = async (value: string) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard is not available.');
  }

  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
};
