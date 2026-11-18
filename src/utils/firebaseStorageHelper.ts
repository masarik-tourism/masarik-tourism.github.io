export const GOOGLE_DRIVE_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbxk3bwCMH7e6NzZKKZhbMCLBbVZT8BKrR_y5IoE_LyTqL0Gqw4-kc80mzH0J_EbqnSENw/exec';

export const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB max for PDF deliverables
export const MAX_IMAGE_BYTES = 500 * 1024; // 500 KB target max for uploaded images
export const STORAGE_FREE_LIMIT_BYTES = 15 * 1024 * 1024 * 1024; // 15 GB Google Drive free quota

export function estimateDataUrlBytes(dataUrl: string): number {
  if (!dataUrl || !dataUrl.startsWith('data:')) return 0;
  const commaIdx = dataUrl.indexOf(',');
  const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export function extractGoogleDriveFileId(urlOrPath?: string): string | null {
  if (!urlOrPath) return null;
  const trimmed = urlOrPath.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('gdrive:')) {
    const id = trimmed.slice('gdrive:'.length).trim();
    return id || null;
  }

  // Match /file/d/{fileId}/...
  const filePathMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (filePathMatch?.[1]) {
    return filePathMatch[1];
  }

  // Match ?id={fileId} or &id={fileId}
  const queryIdMatch = trimmed.match(/drive\.google\.com\/[^?]*\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i);
  if (queryIdMatch?.[1]) {
    return queryIdMatch[1];
  }

  return null;
}

export function buildGoogleDriveUrls(fileId: string): {
  fileId: string;
  downloadUrl: string;
  viewUrl: string;
  thumbnailUrl: string;
  storagePath: string;
} {
  const cleanId = fileId.trim();
  const encodedId = encodeURIComponent(cleanId);
  return {
    fileId: cleanId,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${encodedId}`,
    viewUrl: `https://drive.google.com/file/d/${encodedId}/view`,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${encodedId}&sz=w1600`,
    storagePath: `gdrive:${cleanId}`,
  };
}

/**
 * Resolves a browser-displayable <img> URL (handles Google Drive download/view links
 * by mapping them to Drive's image thumbnail endpoint while keeping data:/blob:/other URLs untouched).
 */
export function getDisplayableDriveImageUrl(urlOrPath?: string): string {
  if (!urlOrPath) return '';
  if (urlOrPath.startsWith('data:') || urlOrPath.startsWith('blob:')) {
    return urlOrPath;
  }
  const driveId = extractGoogleDriveFileId(urlOrPath);
  if (driveId) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1600`;
  }
  return urlOrPath;
}

/**
 * Returns the Google Drive preview/open URL (/file/d/{fileId}/view) when available.
 */
export function getDriveViewUrl(
  downloadUrl?: string,
  explicitViewUrl?: string,
  storagePath?: string
): string {
  if (explicitViewUrl && explicitViewUrl.trim()) {
    return explicitViewUrl.trim();
  }
  const driveId =
    extractGoogleDriveFileId(storagePath) || extractGoogleDriveFileId(downloadUrl);
  if (driveId) {
    return buildGoogleDriveUrls(driveId).viewUrl;
  }
  return downloadUrl || '';
}

function stripBase64DataPrefix(dataUrlOrBase64: string): string {
  const commaIdx = dataUrlOrBase64.indexOf(',');
  return commaIdx >= 0 ? dataUrlOrBase64.slice(commaIdx + 1) : dataUrlOrBase64;
}

function extractMimeFromDataUrl(dataUrl: string, fallback = 'image/jpeg'): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/i);
  return match?.[1] || fallback;
}

async function fileToRawBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف المختار للرفع.'));
    reader.onload = () => {
      const resultStr = String(reader.result || '');
      resolve(stripBase64DataPrefix(resultStr));
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadToGoogleDriveWebApp(params: {
  fileName: string;
  mimeType: string;
  base64: string;
}): Promise<{
  fileId: string;
  downloadUrl: string;
  viewUrl: string;
  thumbnailUrl: string;
  storagePath: string;
}> {
  const cleanBase64 = stripBase64DataPrefix(params.base64).trim();
  if (!cleanBase64) {
    throw new Error('محتوى الملف فارغ ولا يمكن رفعه إلى Google Drive.');
  }

  const response = await fetch(GOOGLE_DRIVE_WEBAPP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    redirect: 'follow',
    body: JSON.stringify({
      fileName: params.fileName,
      mimeType: params.mimeType,
      base64: cleanBase64,
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`فشل الاتصال بخدمة Google Drive (HTTP ${response.status}).`);
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new Error('استجابة غير صالحة من Google Drive Web App.');
  }

  if (parsed?.status === 'error' || parsed?.ok === false || parsed?.error) {
    const msg =
      (typeof parsed.message === 'string' && parsed.message) ||
      (typeof parsed.error === 'string' && parsed.error) ||
      'تعذر حفظ الملف على Google Drive.';
    throw new Error(msg);
  }

  const nestedData =
    parsed?.data && typeof parsed.data === 'object'
      ? (parsed.data as Record<string, unknown>)
      : undefined;

  const rawFileId =
    parsed?.fileId ??
    parsed?.id ??
    nestedData?.fileId ??
    nestedData?.id ??
    '';

  const fileId = String(rawFileId).trim();
  if (!fileId) {
    throw new Error('لم يتم استلام معرف الملف (fileId) من Google Drive.');
  }

  return buildGoogleDriveUrls(fileId);
}

/**
 * Automatically compresses an image File on the client to strictly < 500 KB (480 KB target)
 * prior to uploading to Google Drive.
 */
export async function compressImageFileUnderLimit(
  file: File,
  maxBytes = MAX_IMAGE_BYTES
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.size <= maxBytes && (file.type === 'image/jpeg' || file.type === 'image/webp')) {
    return file;
  }

  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذر قراءة الصورة المختارة.'));
      el.src = bitmapUrl;
    });

    const targetBytes = Math.min(maxBytes, 480 * 1024);
    let maxDim = 1400;
    let quality = 0.82;
    let bestBlob: Blob | null = null;

    for (let attempt = 0; attempt < 7; attempt++) {
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > maxDim || h > maxDim) {
        if (w >= h) {
          h = Math.max(1, Math.round((h * maxDim) / w));
          w = maxDim;
        } else {
          w = Math.max(1, Math.round((w * maxDim) / h));
          h = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) break;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
      );
      if (!blob) break;

      bestBlob = blob;
      if (blob.size <= targetBytes) {
        break;
      }

      if (quality > 0.52) {
        quality = Math.max(0.45, Number((quality - 0.12).toFixed(2)));
      } else {
        maxDim = Math.max(640, Math.round(maxDim * 0.78));
      }
    }

    if (!bestBlob) return file;
    const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
    return new File([bestBlob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

export async function uploadTravelerDocumentToStorage(
  phone: string,
  docId: string,
  dataUrl: string,
  customFileName?: string
): Promise<{
  downloadUrl: string;
  viewUrl: string;
  storagePath: string;
  sizeBytes: number;
} | null> {
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone || !dataUrl.startsWith('data:')) {
    return null;
  }

  const sizeBytes = estimateDataUrlBytes(dataUrl);
  const mimeType = extractMimeFromDataUrl(dataUrl, 'image/jpeg');
  const fileName = customFileName?.trim() || `Masarik_Doc_${cleanPhone}_${docId}.jpg`;

  try {
    const uploaded = await uploadToGoogleDriveWebApp({
      fileName,
      mimeType,
      base64: stripBase64DataPrefix(dataUrl),
    });
    return {
      downloadUrl: uploaded.downloadUrl,
      viewUrl: uploaded.viewUrl,
      storagePath: uploaded.storagePath,
      sizeBytes,
    };
  } catch (err) {
    console.warn('Google Drive document upload skipped/failed; falling back to local cache:', err);
    return null;
  }
}

export async function uploadTravelerAvatarToStorage(
  phone: string,
  dataUrl: string
): Promise<{
  downloadUrl: string;
  viewUrl: string;
  storagePath: string;
  sizeBytes: number;
} | null> {
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone || !dataUrl.startsWith('data:')) {
    return null;
  }

  const sizeBytes = estimateDataUrlBytes(dataUrl);
  const mimeType = extractMimeFromDataUrl(dataUrl, 'image/jpeg');
  const fileName = `Masarik_Photo_${cleanPhone}_${Date.now()}.jpg`;

  try {
    const uploaded = await uploadToGoogleDriveWebApp({
      fileName,
      mimeType,
      base64: stripBase64DataPrefix(dataUrl),
    });
    return {
      downloadUrl: uploaded.downloadUrl,
      viewUrl: uploaded.viewUrl,
      storagePath: uploaded.storagePath,
      sizeBytes,
    };
  } catch (err) {
    console.warn('Google Drive avatar upload failed; using local cache:', err);
    return null;
  }
}

export async function uploadFamilyMemberFileToStorage(
  phone: string,
  memberId: string,
  kind: 'passport' | 'photo',
  dataUrl: string
): Promise<{
  downloadUrl: string;
  viewUrl: string;
  storagePath: string;
  sizeBytes: number;
} | null> {
  const cleanPhone = phone.replace(/\D/g, '');
  const cleanMemberId = memberId.replace(/[^a-zA-Z0-9_-]/g, '') || `${Date.now()}`;
  if (!cleanPhone || !dataUrl.startsWith('data:')) {
    return null;
  }

  const sizeBytes = estimateDataUrlBytes(dataUrl);
  const mimeType = extractMimeFromDataUrl(dataUrl, 'image/jpeg');
  const fileName = `Masarik_Family_${cleanPhone}_${cleanMemberId}_${kind}_${Date.now()}.jpg`;

  try {
    const uploaded = await uploadToGoogleDriveWebApp({
      fileName,
      mimeType,
      base64: stripBase64DataPrefix(dataUrl),
    });
    return {
      downloadUrl: uploaded.downloadUrl,
      viewUrl: uploaded.viewUrl,
      storagePath: uploaded.storagePath,
      sizeBytes,
    };
  } catch (err) {
    console.warn(`Google Drive family ${kind} upload failed; using local cache:`, err);
    return null;
  }
}

export async function uploadIssuedDeliverableToStorage(
  phone: string,
  deliverableId: string,
  file: File
): Promise<{
  downloadUrl: string;
  viewUrl: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}> {
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone) {
    throw new Error('رقم الهاتف غير صالح لمسار التخزين.');
  }

  const lowerName = (file.name || '').toLowerCase();
  const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');

  if (isPdf && file.size > MAX_PDF_BYTES) {
    throw new Error('حجم ملف الـ PDF يتجاوز الحد الأقصى المسموح به (5 ميجابايت).');
  }

  let fileToUpload = file;
  if (!isPdf && file.type.startsWith('image/')) {
    fileToUpload = await compressImageFileUnderLimit(file, MAX_IMAGE_BYTES);
    if (fileToUpload.size > MAX_IMAGE_BYTES) {
      throw new Error('حجم الصورة يتجاوز الحد المسموح بعد الضغط (500 كيلوبايت).');
    }
  } else if (!isPdf && file.size > MAX_PDF_BYTES) {
    throw new Error('حجم الملف المختار يتجاوز الحد الأقصى المسموح (5 ميجابايت).');
  }

  const finalLower = (fileToUpload.name || '').toLowerCase();
  const mime =
    fileToUpload.type ||
    (isPdf
      ? 'application/pdf'
      : finalLower.endsWith('.png')
      ? 'image/png'
      : finalLower.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg');

  const ext =
    mime === 'application/pdf' || isPdf
      ? 'pdf'
      : mime === 'image/png' || finalLower.endsWith('.png')
      ? 'png'
      : mime === 'image/webp' || finalLower.endsWith('.webp')
      ? 'webp'
      : 'jpg';

  const cleanId = deliverableId.replace(/[^a-zA-Z0-9_-]/g, '') || `${Date.now()}`;
  const finalFileName = fileToUpload.name || `Masarik_Deliverable_${cleanPhone}_${cleanId}.${ext}`;
  const base64 = await fileToRawBase64(fileToUpload);

  const uploaded = await uploadToGoogleDriveWebApp({
    fileName: finalFileName,
    mimeType: mime,
    base64,
  });

  return {
    downloadUrl: uploaded.downloadUrl,
    viewUrl: uploaded.viewUrl,
    storagePath: uploaded.storagePath,
    fileName: finalFileName,
    mimeType: mime,
    fileSizeBytes: fileToUpload.size,
  };
}

export async function deleteTravelerDocumentFromStorage(_storagePath?: string): Promise<void> {
  // Files stored via Google Drive Web App do not use Firebase Storage deletion;
  // metadata and links are safely detached from Firestore upon cleanup/removal.
  return Promise.resolve();
}

export function buildDescriptiveFilename(
  kind: 'Passport' | 'Photo' | 'Receipt' | 'Doc',
  firstName?: string,
  lastName?: string,
  ext = 'jpg'
): string {
  const cleanPart = (val?: string) =>
    (val || '')
      .trim()
      .replace(/[/\\?%*:|"<>]/g, '')
      .replace(/\s+/g, '_');

  const first = cleanPart(firstName);
  const last = cleanPart(lastName);
  const nameSegment = [first, last].filter(Boolean).join('_') || 'Traveler';
  return `${kind}_${nameSegment}.${ext}`;
}

function triggerAnchorDownload(href: string, filename: string, openInNewTab = false): void {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  if (openInNewTab) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (link.parentNode) {
      link.parentNode.removeChild(link);
    }
  }, 150);
}

export async function downloadCloudFile(urlOrDataUrl: string, filename: string): Promise<void> {
  if (!urlOrDataUrl) return;
  const safeName = filename || 'Masarik_Document.jpg';

  if (urlOrDataUrl.startsWith('data:') || urlOrDataUrl.startsWith('blob:')) {
    triggerAnchorDownload(urlOrDataUrl, safeName);
    return;
  }

  // Google Drive files use direct export=download URL
  const driveId = extractGoogleDriveFileId(urlOrDataUrl);
  if (driveId) {
    const { downloadUrl } = buildGoogleDriveUrls(driveId);
    triggerAnchorDownload(downloadUrl, safeName, true);
    return;
  }

  const isPdf =
    safeName.toLowerCase().endsWith('.pdf') ||
    urlOrDataUrl.toLowerCase().includes('.pdf') ||
    urlOrDataUrl.startsWith('data:application/pdf');

  try {
    const response = await fetch(urlOrDataUrl, { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    triggerAnchorDownload(blobUrl, safeName);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 6000);
    return;
  } catch {
    if (isPdf) {
      triggerAnchorDownload(urlOrDataUrl, safeName, true);
      return;
    }
    try {
      const blobUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('No canvas context'));
            return;
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(
            (b) => {
              if (!b) {
                reject(new Error('Blob failed'));
                return;
              }
              resolve(URL.createObjectURL(b));
            },
            'image/jpeg',
            0.92
          );
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = urlOrDataUrl;
      });
      triggerAnchorDownload(blobUrl, safeName);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 6000);
      return;
    } catch {
      triggerAnchorDownload(urlOrDataUrl, safeName, true);
    }
  }
}

export async function imageUrlToBase64(urlOrDataUrl: string): Promise<string> {
  if (urlOrDataUrl.includes(',') && urlOrDataUrl.startsWith('data:')) {
    return urlOrDataUrl.split(',')[1];
  }
  const fetchTarget = getDisplayableDriveImageUrl(urlOrDataUrl);
  const response = await fetch(fetchTarget);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read remote image.'));
    reader.onload = () => {
      const res = String(reader.result || '');
      resolve(res.includes(',') ? res.split(',')[1] : res);
    };
    reader.readAsDataURL(blob);
  });
}
