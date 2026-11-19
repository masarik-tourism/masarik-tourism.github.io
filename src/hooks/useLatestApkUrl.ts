import { useState, useEffect, type MouseEvent } from 'react';

const REPO_OWNER = 'masarik-tourism';
const REPO_NAME = 'masarik-tourism.github.io';
export const CURRENT_APP_VERSION = 'v1.0.0';
export const FALLBACK_PAGES_APK_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/Masarik-Tourism.apk`;
export const FAST_CDN_APK_URL = FALLBACK_PAGES_APK_URL;
export const OPEN_APK_UPDATER_EVENT = 'masarik-open-apk-updater';

export interface LatestApkInfo {
  downloadUrl: string;
  version: string;
  sizeBytes: number | null;
  sizeLabel: string | null;
  isLoading: boolean;
}

export function getInstalledAndroidAppVersion(): string {
  if (typeof navigator === 'undefined') return '1.0.0';
  const match = navigator.userAgent.match(/MasarikApp\/([0-9]+(?:\.[0-9]+)*)/i);
  return match?.[1] || '1.0.0';
}

export function isVersionNewer(remoteTag: string, localVersion: string): boolean {
  const cleanRemote = remoteTag.trim().replace(/^v/i, '');
  const cleanLocal = localVersion.trim().replace(/^v/i, '');
  const rParts = cleanRemote.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const lParts = cleanLocal.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const len = Math.max(rParts.length, lParts.length);
  for (let i = 0; i < len; i += 1) {
    const r = rParts[i] || 0;
    const l = lParts[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

export async function fetchLatestGitHubRelease(): Promise<Omit<LatestApkInfo, 'isLoading'>> {
  const requestInit: RequestInit = {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github.v3+json',
    },
  };

  const timestamp = Date.now();
  let tagName = CURRENT_APP_VERSION;
  let sizeBytes: number | null = null;
  let sizeLabel: string | null = null;
  let resolvedDownloadUrl = FALLBACK_PAGES_APK_URL;

  try {
    const releaseResponse = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest?t=${timestamp}`,
      requestInit
    );

    if (releaseResponse.ok) {
      const data = await releaseResponse.json();
      const apkAsset = data.assets?.find(
        (asset: { name?: string; browser_download_url?: string; size?: number }) =>
          asset.name?.toLowerCase().endsWith('.apk')
      );

      if (typeof data.tag_name === 'string' && data.tag_name.trim()) {
        tagName = data.tag_name.trim();
      }

      if (
        typeof apkAsset?.browser_download_url === 'string' &&
        apkAsset.browser_download_url.startsWith('https://')
      ) {
        resolvedDownloadUrl = apkAsset.browser_download_url;
      }

      if (typeof apkAsset?.size === 'number' && apkAsset.size > 0) {
        sizeBytes = apkAsset.size;
        sizeLabel = `${(apkAsset.size / (1024 * 1024)).toFixed(1)} MB`;
      }
    }
  } catch {
    // Keep GitHub Releases direct fallback URL on network/parse error
  }

  return {
    downloadUrl: resolvedDownloadUrl,
    version: tagName,
    sizeBytes,
    sizeLabel,
  };
}

/**
 * Triggers the global in-app updater / direct APK downloader modal with 0%-100% progress.
 */
export function triggerApkUpdateModal(mode: 'check' | 'download' = 'check'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_APK_UPDATER_EVENT, { detail: { mode } }));
}

/**
 * Directly triggers native/browser binary download without navigating away to GitHub webpage.
 */
export function launchDirectApkInstall(apkDownloadUrl: string): void {
  const targetUrl = apkDownloadUrl || FALLBACK_PAGES_APK_URL;

  if (typeof window !== 'undefined' && window.AndroidBridge?.openExternalUrl) {
    window.AndroidBridge.openExternalUrl(targetUrl);
    return;
  }

  if (typeof document !== 'undefined') {
    const link = document.createElement('a');
    link.href = targetUrl;
    link.download = 'Masarik-Tourism.apk';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Handles APK download clicks across both Android WebView and standard browsers
 * by opening the in-app progress downloader modal instead of external GitHub links.
 */
export function handleApkDownload(
  _apkDownloadUrl: string,
  event?: MouseEvent<HTMLElement>
): void {
  if (event) {
    event.preventDefault();
  }
  triggerApkUpdateModal('download');
}

export const useLatestApkInfo = (): LatestApkInfo => {
  const [info, setInfo] = useState<LatestApkInfo>({
    downloadUrl: FALLBACK_PAGES_APK_URL,
    version: CURRENT_APP_VERSION,
    sizeBytes: null,
    sizeLabel: null,
    isLoading: true,
  });

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const res = await fetchLatestGitHubRelease();
      if (isMounted) {
        setInfo({
          ...res,
          isLoading: false,
        });
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  return info;
};

export const useLatestApkUrl = (): string => {
  const { downloadUrl } = useLatestApkInfo();
  return downloadUrl;
};
