import { requestQortal } from "./qortalClient";

export interface UserAccount {
  address: string;
  publicKey?: string;
  name?: string;
}

interface AccountNameResponse {
  name?: string;
}

const normalizeNames = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }

      if (typeof entry === "object" && entry !== null) {
        const candidate = (entry as AccountNameResponse).name;
        return typeof candidate === "string" ? candidate : null;
      }

      return null;
    })
    .filter((name): name is string => Boolean(name && name.trim()));
};

export const getUserAccount = async (): Promise<UserAccount> => {
  return requestQortal<UserAccount>({ action: "GET_USER_ACCOUNT" });
};

export const getAccountNames = async (address: string): Promise<string[]> => {
  const raw = await requestQortal<unknown>({
    action: "GET_ACCOUNT_NAMES",
    address,
  });

  return normalizeNames(raw);
};
