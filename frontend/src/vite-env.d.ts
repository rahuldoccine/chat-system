/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_FILES_API_PATH?: string;
  readonly VITE_GIPHY_API_KEY?: string;
  readonly VITE_GIPHY_API_BASE?: string;
  readonly VITE_GIPHY_SEARCH_LIMIT?: string;
  readonly VITE_GIPHY_DOWNLOAD_QUALITY?: string;
  readonly VITE_GIPHY_MAX_DOWNLOAD_MB?: string;
  readonly VITE_SCROLL_DEBUG?: string;
  readonly VITE_MAX_ATTACHMENTS?: string;
  readonly VITE_ALLOWED_FILE_EXTENSIONS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
