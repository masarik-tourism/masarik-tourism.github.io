/// <reference types="vite/client" />

declare const __APP_BUILD_VERSION__: string;

interface AndroidBridgeInterface {
  openExternalUrl: (url: string) => void;
  hasNotificationPermission?: () => boolean;
  requestNotificationPermission?: () => void;
  showNativeNotification?: (
    title: string,
    body: string,
    role: string,
    action: string,
    phone: string
  ) => void;
  showNotification?: (title: string, body: string) => void;
  getNativeFcmToken?: () => string;
  refreshNativeFcmToken?: () => void;
}

interface Window {
  AndroidBridge?: AndroidBridgeInterface;
  __MASARIK_NATIVE_FCM_TOKEN__?: string;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.jpeg' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  const content: string;
  export default content;
}
