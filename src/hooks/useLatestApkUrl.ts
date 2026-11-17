import { useState, useEffect, type MouseEvent } from 'react';

const REPO_OWNER = 'masarik-tourism';
const REPO_NAME = 'masarik-tourism.github.io';
export const FALLBACK_PAGES_APK_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/Masarik-Tourism.apk`;
export const FAST_CDN_APK_URL = FALLBACK_PAGES_APK_URL;

export interface LatestApkInfo {
  downloadUrl: string;
  version: string;
  sizeLabel: string | null;
  isLoading: boolean;
}

/**
 * Handles APK download clicks across both Android WebView (via AndroidBridge)
 * and standard mobile/desktop browsers.
 */
export function handleApkDownload(
  apkDownloadUrl: string,
  event?: MouseEvent<HTMLElement>
): void {
  if (event) {
    event.preventDefault();
  }

  const targetUrl = apkDownloadUrl || FALLBACK_PAGES_APK_URL;

  if (typeof window !== 'undefined' && window.AndroidBridge?.openExternalUrl) {
    window.AndroidBridge.openExternalUrl(targetUrl);
    return;
  }

  if (typeof window !== 'undefined') {
    window.location.href = targetUrl;
  }
}

export const useLatestApkInfo = (): LatestApkInfo => {
  const [info, setInfo] = useState<LatestApkInfo>({
    downloadUrl: FALLBACK_PAGES_APK_URL,
    version: 'v1.0.0',
    sizeLabel: null,
    isLoading: true,
  });

  useEffect(() => {
    let isMounted = true;

    const fetchLatestReleaseMetadata = async () => {
      const requestInit: RequestInit = {
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT',
        },
      };

      const timestamp = Date.now();
      let tagName = 'v1.0.0';
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
            sizeLabel = `${(apkAsset.size / (1024 * 1024)).toFixed(1)} MB`;
          }
        }
      } catch {
        // Keep GitHub Releases direct fallback URL on network/parse error
      }

      if (isMounted) {
        setInfo({
          downloadUrl: resolvedDownloadUrl,
          version: tagName,
          sizeLabel,
          isLoading: false,
        });
      }
    };

    void fetchLatestReleaseMetadata();

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
