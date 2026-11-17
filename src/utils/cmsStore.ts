import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { CmsCustomItem } from '../types/travel';
import { AppLanguage } from '../contexts/LanguageContext';
import { OperationType, db, handleFirestoreError } from '../firebase';

export interface CmsDataState {
  /** Keyed by `${lang}:${editableKey}` */
  textOverrides: Record<string, string>;
  /** Keys of deleted editable blocks or cards */
  deletedKeys: string[];
  /** Custom items added dynamically into service/offer grids */
  customItems: CmsCustomItem[];
}

const CMS_STORAGE_KEY = 'masarik_cms_overrides_v1';
export const CMS_UPDATED_EVENT = 'masarik-cms-updated';
const CMS_DOC_PATH = 'site_config/cms';

const EMPTY_CMS: CmsDataState = {
  textOverrides: {},
  deletedKeys: [],
  customItems: [],
};

// In-memory Draft Staging Layer for Live Site Editor Mode
let draftActive = false;
let draftState: CmsDataState | null = null;

function cloneCmsState(state: CmsDataState): CmsDataState {
  return {
    textOverrides: { ...(state.textOverrides || {}) },
    deletedKeys: [...(state.deletedKeys || [])],
    customItems: (state.customItems || []).map((item) => ({
      ...item,
      featuresAr: [...(item.featuresAr || [])],
      featuresEn: [...(item.featuresEn || [])],
    })),
  };
}

function emitCmsUpdate(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CMS_UPDATED_EVENT));
  }
}

function sanitizeCmsPayload(state: CmsDataState) {
  const rawOverrides = state.textOverrides || {};
  const textOverrides: Record<string, string> = {};
  Object.entries(rawOverrides)
    .slice(0, 500)
    .forEach(([k, v]) => {
      if (typeof k === 'string' && typeof v === 'string') {
        textOverrides[k.slice(0, 180)] = v.slice(0, 4000);
      }
    });

  const deletedKeys = Array.isArray(state.deletedKeys)
    ? state.deletedKeys
        .filter((k): k is string => typeof k === 'string' && k.length > 0)
        .slice(0, 200)
        .map((k) => k.slice(0, 200))
    : [];

  const customItems = Array.isArray(state.customItems)
    ? state.customItems.slice(0, 100).map((item) => ({
        id: String(item.id || '').slice(0, 80),
        gridId: String(item.gridId || '').slice(0, 80),
        ...(item.categoryId ? { categoryId: String(item.categoryId).slice(0, 80) } : {}),
        titleAr: String(item.titleAr || '').slice(0, 200),
        titleEn: String(item.titleEn || '').slice(0, 200),
        ...(item.badgeAr ? { badgeAr: String(item.badgeAr).slice(0, 120) } : {}),
        ...(item.badgeEn ? { badgeEn: String(item.badgeEn).slice(0, 120) } : {}),
        ...(item.priceOfferAr ? { priceOfferAr: String(item.priceOfferAr).slice(0, 120) } : {}),
        ...(item.priceOfferEn ? { priceOfferEn: String(item.priceOfferEn).slice(0, 120) } : {}),
        featuresAr: Array.isArray(item.featuresAr)
          ? item.featuresAr.slice(0, 20).map((f) => String(f).slice(0, 300))
          : [],
        featuresEn: Array.isArray(item.featuresEn)
          ? item.featuresEn.slice(0, 20).map((f) => String(f).slice(0, 300))
          : [],
        createdAt: String(item.createdAt || new Date().toISOString()).slice(0, 64),
      }))
    : [];

  return {
    textOverrides,
    deletedKeys,
    customItems,
    updatedAt: new Date().toISOString(),
  };
}

function writeCmsLocalOnly(next: CmsDataState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CMS_STORAGE_KEY, JSON.stringify(next));
    emitCmsUpdate();
  } catch {
    // Ignore quota errors
  }
}

async function syncCmsToCloud(state: CmsDataState): Promise<void> {
  const payload = sanitizeCmsPayload(state);
  try {
    await setDoc(doc(db, 'site_config', 'cms'), payload);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.WRITE, CMS_DOC_PATH);
    }
    console.warn('CMS cloud sync deferred (offline/cache active):', msg);
  }
}

export function getCommittedCmsState(): CmsDataState {
  if (typeof window === 'undefined') return EMPTY_CMS;
  try {
    const raw = window.localStorage.getItem(CMS_STORAGE_KEY);
    if (!raw) return EMPTY_CMS;
    const parsed = JSON.parse(raw) as Partial<CmsDataState>;
    return {
      textOverrides:
        parsed.textOverrides && typeof parsed.textOverrides === 'object'
          ? parsed.textOverrides
          : {},
      deletedKeys: Array.isArray(parsed.deletedKeys) ? parsed.deletedKeys : [],
      customItems: Array.isArray(parsed.customItems) ? parsed.customItems : [],
    };
  } catch {
    return EMPTY_CMS;
  }
}

export function getCmsState(): CmsDataState {
  if (draftActive && draftState) {
    return draftState;
  }
  return getCommittedCmsState();
}

export function isCmsDraftActive(): boolean {
  return draftActive;
}

export function getCmsDraftChangeCount(): number {
  if (!draftActive || !draftState) return 0;
  const committed = getCommittedCmsState();
  let count = 0;

  const overrideKeys = new Set([
    ...Object.keys(committed.textOverrides || {}),
    ...Object.keys(draftState.textOverrides || {}),
  ]);
  overrideKeys.forEach((key) => {
    if (committed.textOverrides[key] !== draftState!.textOverrides[key]) {
      count += 1;
    }
  });

  const committedDeleted = new Set(committed.deletedKeys || []);
  const draftDeleted = new Set(draftState.deletedKeys || []);
  const allDeletedKeys = new Set([...committedDeleted, ...draftDeleted]);
  allDeletedKeys.forEach((key) => {
    if (committedDeleted.has(key) !== draftDeleted.has(key)) {
      count += 1;
    }
  });

  const committedItemsMap = new Map(
    (committed.customItems || []).map((it) => [it.id, JSON.stringify(it)])
  );
  const draftItemsMap = new Map(
    (draftState.customItems || []).map((it) => [it.id, JSON.stringify(it)])
  );
  const allItemIds = new Set([...committedItemsMap.keys(), ...draftItemsMap.keys()]);
  allItemIds.forEach((id) => {
    if (committedItemsMap.get(id) !== draftItemsMap.get(id)) {
      count += 1;
    }
  });

  return count;
}

export function hasUnsavedCmsChanges(): boolean {
  return getCmsDraftChangeCount() > 0;
}

export function beginCmsDraftSession(): void {
  if (!draftActive) {
    draftActive = true;
    draftState = cloneCmsState(getCommittedCmsState());
    emitCmsUpdate();
  }
}

export function discardCmsDraftSession(): void {
  if (draftActive || draftState) {
    draftActive = false;
    draftState = null;
    emitCmsUpdate();
  }
}

export async function commitCmsDraftSession(): Promise<void> {
  if (!draftActive || !draftState) return;
  const committed = cloneCmsState(draftState);
  writeCmsLocalOnly(committed);
  draftState = cloneCmsState(committed);
  emitCmsUpdate();
  await syncCmsToCloud(committed);
}

export function subscribeCmsCloud(): () => void {
  const ref = doc(db, 'site_config', 'cms');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as Partial<CmsDataState>;
      const next: CmsDataState = {
        textOverrides:
          data.textOverrides && typeof data.textOverrides === 'object' ? data.textOverrides : {},
        deletedKeys: Array.isArray(data.deletedKeys) ? data.deletedKeys : [],
        customItems: Array.isArray(data.customItems) ? data.customItems : [],
      };
      const wasDirty = draftActive && hasUnsavedCmsChanges();
      writeCmsLocalOnly(next);
      if (draftActive && !wasDirty) {
        draftState = cloneCmsState(next);
        emitCmsUpdate();
      }
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.GET, CMS_DOC_PATH);
      }
      console.warn('CMS cloud listener warning:', msg);
    }
  );
}

function saveCmsState(next: CmsDataState): CmsDataState {
  if (draftActive) {
    draftState = cloneCmsState(next);
    emitCmsUpdate();
    return draftState;
  }
  writeCmsLocalOnly(next);
  void syncCmsToCloud(next);
  return next;
}

export function setCmsTextOverride(editableKey: string, lang: AppLanguage, newText: string): void {
  const current = getCmsState();
  const scopedKey = `${lang}:${editableKey}`;
  saveCmsState({
    ...current,
    textOverrides: {
      ...current.textOverrides,
      [scopedKey]: newText,
    },
  });
}

export function clearCmsTextOverride(editableKey: string, lang: AppLanguage): void {
  const current = getCmsState();
  const scopedKey = `${lang}:${editableKey}`;
  const nextOverrides = { ...current.textOverrides };
  delete nextOverrides[scopedKey];
  saveCmsState({
    ...current,
    textOverrides: nextOverrides,
  });
}

export function markCmsElementDeleted(editableKey: string): void {
  const current = getCmsState();
  if (current.deletedKeys.includes(editableKey)) return;
  saveCmsState({
    ...current,
    deletedKeys: [...current.deletedKeys, editableKey],
  });
}

export function restoreCmsElement(editableKey: string): void {
  const current = getCmsState();
  saveCmsState({
    ...current,
    deletedKeys: current.deletedKeys.filter((k) => k !== editableKey),
  });
}

export function addCmsCustomItem(item: Omit<CmsCustomItem, 'id' | 'createdAt'>): CmsCustomItem {
  const current = getCmsState();
  const created: CmsCustomItem = {
    ...item,
    id: `cms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  saveCmsState({
    ...current,
    customItems: [...current.customItems, created],
  });
  return created;
}

export function updateCmsCustomItem(
  id: string,
  updates: Partial<Omit<CmsCustomItem, 'id' | 'createdAt'>>
): void {
  const current = getCmsState();
  saveCmsState({
    ...current,
    customItems: current.customItems.map((it) => (it.id === id ? { ...it, ...updates } : it)),
  });
}

export function deleteCmsCustomItem(id: string): void {
  const current = getCmsState();
  saveCmsState({
    ...current,
    customItems: current.customItems.filter((it) => it.id !== id),
  });
}

export function resetAllCmsOverrides(): void {
  draftActive = false;
  draftState = null;
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(CMS_STORAGE_KEY);
    emitCmsUpdate();
  }
  void syncCmsToCloud(EMPTY_CMS);
}

export function useCmsState(): CmsDataState {
  const [state, setState] = useState<CmsDataState>(() => getCmsState());

  useEffect(() => {
    const sync = () => setState(getCmsState());
    window.addEventListener(CMS_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CMS_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return state;
}
