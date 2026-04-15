declare const qortalRequest: unknown;

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const REQUEST_TIMEOUT_MS = 120_000;

interface QortalRequestOptions {
  timeoutMs?: number;
}

export type QortalResourceToPublish = {
  service: string;
  identifier: string;
  name?: string;
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  data64: string;
  filename?: string;
  disableEncrypt?: boolean;
};

const parseRequestError = (response: unknown): string | null => {
  if (response === null || response === undefined) {
    return 'Qortal request returned an empty response.';
  }

  if (typeof response === 'string') {
    const trimmed = response.trim();

    if (!trimmed) {
      return 'Qortal request returned an empty response.';
    }

    if (
      trimmed.toLowerCase() === 'false' ||
      trimmed.toLowerCase().startsWith('error')
    ) {
      return trimmed;
    }

    return null;
  }

  if (!isObject(response)) {
    return null;
  }

  if (typeof response.error === 'string' && response.error.trim()) {
    return response.error;
  }

  if (typeof response.message === 'string' && response.message.trim()) {
    return response.message;
  }

  if (response.error === true || response.success === false) {
    return 'Qortal request failed.';
  }

  return null;
};

const parseMultiResourcePublishError = (response: unknown): string | null => {
  if (!Array.isArray(response)) {
    return null;
  }

  const failedIndex = response.findIndex((entry) => parseRequestError(entry));
  if (failedIndex === -1) {
    return null;
  }

  const entryError = parseRequestError(response[failedIndex]);
  return entryError
    ? `Qortal resource publish failed at item ${failedIndex + 1}: ${entryError}`
    : `Qortal resource publish failed at item ${failedIndex + 1}.`;
};

const getQortalRequest = () => {
  if (typeof qortalRequest === 'function') {
    return qortalRequest;
  }

  const globalRequest = (
    globalThis as typeof globalThis & { qortalRequest?: unknown }
  ).qortalRequest;
  if (typeof globalRequest === 'function') {
    return globalRequest;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  let parentRequest: unknown = null;
  try {
    parentRequest = (
      window as Window & { parent?: { qortalRequest?: unknown } }
    ).parent?.qortalRequest;
  } catch {
    parentRequest = null;
  }

  if (typeof parentRequest === 'function') {
    return parentRequest;
  }

  const localRequest = (window as Window & { qortalRequest?: unknown })
    .qortalRequest;
  if (typeof localRequest === 'function') {
    return localRequest;
  }

  let topRequest: unknown = null;
  try {
    topRequest = (window as Window & { top?: { qortalRequest?: unknown } }).top
      ?.qortalRequest;
  } catch {
    topRequest = null;
  }
  if (typeof topRequest === 'function') {
    return topRequest;
  }

  return null;
};

export const isQortalRequestAvailable = () => {
  return typeof getQortalRequest() === 'function';
};

export const requestQortal = async <TResponse>(
  payload: Record<string, unknown>,
  options?: QortalRequestOptions
): Promise<TResponse> => {
  const qortalRequest = getQortalRequest();

  if (!qortalRequest) {
    throw new Error(
      'Qortal request interface is not available in this environment.'
    );
  }

  const action =
    typeof payload.action === 'string' ? payload.action : 'UNKNOWN_ACTION';
  const service =
    typeof payload.service === 'string' ? payload.service : undefined;
  const identifier =
    typeof payload.identifier === 'string' ? payload.identifier : undefined;
  const label = [action, service, identifier].filter(Boolean).join(':');
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;

  let didTimeout = false;

  const baseRequestPromise = Promise.resolve(qortalRequest(payload as never));
  baseRequestPromise.catch(() => {
    if (!didTimeout) {
      return;
    }
  });

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      didTimeout = true;
      reject(
        new Error(
          `Qortal request timed out after ${timeoutMs / 1000} seconds (${label}).`
        )
      );
    }, timeoutMs);
  });

  try {
    const response = (await Promise.race([
      baseRequestPromise,
      timeoutPromise,
    ])) as unknown;

    const requestError = parseRequestError(response);
    if (requestError) {
      throw new Error(requestError);
    }

    return response as TResponse;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

export const publishMultipleQortalResources = async (
  resources: QortalResourceToPublish[],
  options?: QortalRequestOptions
) => {
  if (resources.length === 0) {
    return [];
  }

  const response = await requestQortal<unknown>(
    {
      action: 'PUBLISH_MULTIPLE_QDN_RESOURCES',
      resources,
    },
    options
  );

  const publishError = parseMultiResourcePublishError(response);
  if (publishError) {
    throw new Error(publishError);
  }

  return response;
};
