const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, '');

const ensureRoutePath = (value: string) => {
  if (!value) {
    return '/';
  }

  if (value.startsWith('/')) {
    return value;
  }

  if (value.startsWith('#/')) {
    return value.slice(1);
  }

  if (value.startsWith('#')) {
    return `/${value.slice(1)}`;
  }

  return `/${value}`;
};

export const buildQortalShareLink = (routePath: string) => {
  if (typeof window === 'undefined') {
    return '';
  }

  const qortalWindow = window as Window & { _qdnBase?: string };
  const qdnBase = qortalWindow._qdnBase;
  const normalizedRoutePath = ensureRoutePath(routePath);

  if (typeof qdnBase === 'string' && qdnBase.startsWith('/render/')) {
    const qdnSegments = trimSlashes(qdnBase).split('/');
    const sharePath = qdnSegments.slice(1).join('/');
    return `qortal://${sharePath}${normalizedRoutePath}`;
  }

  return `${window.location.origin}${normalizedRoutePath}`;
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
