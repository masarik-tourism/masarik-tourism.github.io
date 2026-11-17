import { deleteObject, getDownloadURL, ref, uploadString } from 'firebase/storage';
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

export async function deleteTravelerDocumentFromStorage(storagePath?: string): Promise<void> {
  if (!storagePath) return;
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch {
    // Ignore missing object or permission errors on delete cleanup
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
