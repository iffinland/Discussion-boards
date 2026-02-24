/// <reference types="vite/client" />

declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_ENABLE_QORTAL_PUBLISH?: string;
  readonly VITE_QORTAL_QDN_NAME?: string;
  readonly VITE_QORTAL_NODE_URL?: string;
  readonly VITE_QORTAL_QDN_SERVICE?: string;
  readonly VITE_QORTAL_QDN_IDENTIFIER?: string;
  readonly VITE_QORTAL_QDN_FILENAME?: string;
  readonly VITE_QORTAL_SNAPSHOT_URL?: string;
  readonly VITE_FORUM_ADMIN_NAMES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
