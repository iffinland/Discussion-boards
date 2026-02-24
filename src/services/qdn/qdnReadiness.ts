import { requestQortal } from "../qortal/qortalClient";

const READY_STATUS = "READY";
const BUILDABLE_STATUSES = new Set([
  "PUBLISHED",
  "DOWNLOADING",
  "DOWNLOADED",
  "BUILDING",
]);
const STATUS_POLL_RETRIES = 8;
const STATUS_POLL_DELAY_MS = 1200;

type QdnStatusResponse =
  | string
  | {
      status?: string;
      localChunkCount?: number;
      totalChunkCount?: number;
    };

const sleep = async (durationMs: number) => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
};

const normalizeStatus = (value: QdnStatusResponse): string => {
  if (typeof value === "string") {
    return value.toUpperCase();
  }

  if (typeof value?.status === "string") {
    return value.status.toUpperCase();
  }

  return "";
};

const getQdnResourceStatus = async (
  service: string,
  name: string,
  identifier: string,
  build?: boolean
) => {
  return requestQortal<QdnStatusResponse>({
    action: "GET_QDN_RESOURCE_STATUS",
    service,
    name,
    identifier,
    build,
  });
};

export const ensureQdnResourceReady = async (
  service: string,
  name: string,
  identifier: string
) => {
  let status = normalizeStatus(
    await getQdnResourceStatus(service, name, identifier, false)
  );

  if (status === READY_STATUS) {
    return;
  }

  if (BUILDABLE_STATUSES.has(status)) {
    // Trigger build once when resource is known but not yet ready.
    await getQdnResourceStatus(service, name, identifier, true);
  }

  for (let attempt = 0; attempt < STATUS_POLL_RETRIES; attempt += 1) {
    status = normalizeStatus(
      await getQdnResourceStatus(service, name, identifier, false)
    );

    if (status === READY_STATUS) {
      return;
    }

    if (attempt < STATUS_POLL_RETRIES - 1) {
      await sleep(STATUS_POLL_DELAY_MS);
    }
  }
};
