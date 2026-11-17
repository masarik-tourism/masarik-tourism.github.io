import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
  uploadString,
} from 'firebase/storage';
import { storage } from '../firebase';

export async function uploadTravelerDocumentToStorage(
  phone: string,
  docId: string,
  dataUrl: string
): Promise<{ downloadUrl: string; storagePath: string } | null> {
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone || !dataUrl.startsWith('data:')) {
    return null;
  }

  const storagePath = `travelers/${cleanPhone}/documents/${docId}.jpg`;
  try {
    const storageRef = ref(storage, storagePath);
    await uploadString(storageRef, dataUrl, 'data_url', {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
    });
    const downloadUrl = await getDownloadURL(storageRef);
    return { downloadUrl, storagePath };
  } catch (err) {
    console.warn('Firebase Storage upload skipped/failed; falling back to local cache:', err);
    return null;
  }
}

export async function uploadTravelerAvatarToStorage(
  phone: string,
  dataUrl: string
): Promise<{ downloadUrl: string; storagePath: string } | null> {
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone || !dataUrl.startsWith('data:')) {
    return null;
  }

  const storagePath = `travelers/${cleanPhone}/avatar-${Date.now()}.jpg`;
  try {
    const storageRef = ref(storage, storagePath);
    await uploadString(storageRef, dataUrl, 'data_url', {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
    });
    const downloadUrl = await getDownloadURL(storageRef);
    return { downloadUrl, storagePath };
  } catch (err) {
    console.warn('Firebase Storage avatar upload failed; using local cache:', err);
    return null;
  }
}

export async function uploadFamilyMemberFileToStorage(
  phone: string,
  memberId: string,
  kind: 'passport' | 'photo',
  dataUrl: string
): Promise<{ downloadUrl: string; storagePath: string } | null> {
  const cleanPhone = phone.replace(/\D/g, '');
  const cleanMemberId = memberId.replace(/[^a-zA-Z0-9_-]/g, '') || `${Date.now()}`;
  if (!cleanPhone || !dataUrl.startsWith('data:')) {
    return null;
  }

  const storagePath = `travelers/${cleanPhone}/family/${cleanMemberId}/${kind}-${Date.now()}.jpg`;
  try {
    const storageRef = ref(storage, storagePath);
    await uploadString(storageRef, dataUrl, 'data_url', {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
    });
    const downloadUrl = await getDownloadURL(storageRef);
    return { downloadUrl, storagePath };
  } catch (err) {
    console.warn(`Firebase Storage family ${kind} upload failed; using local cache:`, err);
    return null;
  }
}

export async function uploadIssuedDeliverableToStorage(
  phone: string,
  deliverableId: string,
  file: File
): Promise<{
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
}> {
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone) {
    throw new Error('Invalid phone number for storage path.');
  }

  const lowerName = (file.name || '').toLowerCase();
  const mime =
    file.type ||
    (lowerName.endsWith('.pdf')
      ? 'application/pdf'
      : lowerName.endsWith('.png')
      ? 'image/png'
      : lowerName.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg');

  const ext =
    mime === 'application/pdf' || lowerName.endsWith('.pdf')
      ? 'pdf'
      : mime === 'image/png' || lowerName.endsWith('.png')
      ? 'png'
      : mime === 'image/webp' || lowerName.endsWith('.webp')
      ? 'webp'
      : 'jpg';

  const cleanId = deliverableId.replace(/[^a-zA-Z0-9_-]/g, '') || `${Date.now()}`;
  const storagePath = `travelers/${cleanPhone}/deliverables/${cleanId}.${ext}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, {
    contentType: mime,
    cacheControl: 'public, max-age=31536000',
  });

  const downloadUrl = await getDownloadURL(storageRef);
  return {
    downloadUrl,
    storagePath,
    fileName: file.name || `Masarik_Deliverable_${cleanId}.${ext}`,
    mimeType: mime,
  };
}

export async function deleteTravelerDocumentFromStorage(storagePath?: string): Promise<void> {
  if (!storagePath) return;
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch {
    // Ignore missing object or permission errors on delete cleanup
  }
}

export function buildDescriptiveFilename(
  kind: 'Passport' | 'Photo' | 'Doc',
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
  const isPdf =
    safeName.toLowerCase().endsWith('.pdf') ||
    urlOrDataUrl.toLowerCase().includes('.pdf') ||
    urlOrDataUrl.startsWith('data:application/pdf');

  if (urlOrDataUrl.startsWith('data:') || urlOrDataUrl.startsWith('blob:')) {
    triggerAnchorDownload(urlOrDataUrl, safeName);
    return;
  }

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
      // PDF files cannot be rendered through an <img> canvas; fall back directly to browser download/open
      triggerAnchorDownload(urlOrDataUrl, safeName, true);
      return;
    }
    // Fallback via CORS image canvas conversion for images
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
      // Final safe fallback
      triggerAnchorDownload(urlOrDataUrl, safeName, true);
    }
  }
}

export async function imageUrlToBase64(urlOrDataUrl: string): Promise<string> {
  if (urlOrDataUrl.includes(',')) {
    return urlOrDataUrl.split(',')[1];
  }
  const response = await fetch(urlOrDataUrl);
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
