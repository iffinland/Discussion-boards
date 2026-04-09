import { requestQortal } from './qortalClient';

export interface UserAccount {
  address: string;
  publicKey?: string;
  name?: string;
}

interface AccountNameResponse {
  name?: string;
}

interface NameDataResponse {
  owner?: string;
  ownerAddress?: string;
  address?: string;
}

const normalizeNames = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }

      if (typeof entry === 'object' && entry !== null) {
        const candidate = (entry as AccountNameResponse).name;
        return typeof candidate === 'string' ? candidate : null;
      }

      return null;
    })
    .filter((name): name is string => Boolean(name && name.trim()));
};

export const getUserAccount = async (): Promise<UserAccount> => {
  return requestQortal<UserAccount>({ action: 'GET_USER_ACCOUNT' });
};

export const getAccountNames = async (address: string): Promise<string[]> => {
  const raw = await requestQortal<unknown>({
    action: 'GET_ACCOUNT_NAMES',
    address,
  });

  return normalizeNames(raw);
};

const normalizeAddress = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const resolveNameWalletAddress = async (
  name: string
): Promise<string | null> => {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return null;
  }

  const response = await requestQortal<NameDataResponse | null>({
    action: 'GET_NAME_DATA',
    name: trimmedName,
  });

  if (!response || typeof response !== 'object') {
    return null;
  }

  return (
    normalizeAddress(response.owner) ||
    normalizeAddress(response.ownerAddress) ||
    normalizeAddress(response.address)
  );
};

export const getQortBalance = async (): Promise<number> => {
  const response = await requestQortal<unknown>({
    action: 'GET_BALANCE',
    coin: 'QORT',
  });

  if (typeof response === 'number' && Number.isFinite(response)) {
    return response;
  }

  if (typeof response === 'string') {
    const parsed = Number(response);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error('Unable to read QORT balance.');
};
