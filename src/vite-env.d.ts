/// <reference types="vite/client" />

declare module '*.css';

interface ImportMetaEnv {
  readonly VITE_QORTAL_QDN_SERVICE?: string;
  readonly VITE_QORTAL_QDN_IDENTIFIER?: string;
  readonly VITE_QAPP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
