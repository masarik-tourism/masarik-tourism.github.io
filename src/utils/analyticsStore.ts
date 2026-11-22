import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { DailyAnalyticsRecord, AnalyticsSummaryTotals } from '../types/travel';
import { isRunningInApp } from './appEnvironment';
import { getActiveAdminSession } from './adminAuthStore';

export interface AnalyticsPeriodSummary {
  total: number;
  app: number;
  web: number;
}

export interface AnalyticsDashboardState {
  today: DailyAnalyticsRecord;
  last7Days: AnalyticsPeriodSummary;
  last30Days: AnalyticsPeriodSummary;
  allTime: AnalyticsSummaryTotals;
  dailyRecords: DailyAnalyticsRecord[];
  isLoading: boolean;
  lastUpdatedIso: string;
}

const DEFAULT_ANALYTICS_STATE: AnalyticsDashboardState = {
  today: {
    date: new Date().toISOString().slice(0, 10),
    total: 0,
    app: 0,
    web: 0,
  },
  last7Days: { total: 0, app: 0, web: 0 },
  last30Days: { total: 0, app: 0, web: 0 },
  allTime: { id: 'totals', total: 0, app: 0, web: 0 },
  dailyRecords: [],
  isLoading: true,
  lastUpdatedIso: '',
};

/**
 * Records a unique visitor visit per calendar day (UTC/Local YYYY-MM-DD).
 * - Distinguishes between Mobile Application (app) and Web Browser (web).
 * - Strictly excludes active Admin / General Manager sessions to preserve 100% genuine stats.
 * - Uses atomic Firestore increment(1) with merge: true.
 */
export async function recordUniqueDailyVisit(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // 1. Exclude active admin sessions from analytics
    const adminSession = getActiveAdminSession();
    if (adminSession) {
      return;
    }

    // 2. Check localStorage daily guard
    const today = new Date().toISOString().slice(0, 10);
    const storageKey = `masarik_unique_visit_${today}`;
    if (window.localStorage.getItem(storageKey) === '1') {
      return;
    }

    // 3. Detect client runtime source
    const isApp = isRunningInApp();
    const nowIso = new Date().toISOString();

    const dailyRef = doc(db, 'analytics_daily', today);
    const summaryRef = doc(db, 'analytics_summary', 'totals');

    await Promise.all([
      setDoc(
        dailyRef,
        {
          date: today,
          total: increment(1),
          app: increment(isApp ? 1 : 0),
          web: increment(isApp ? 0 : 1),
          updatedAt: nowIso,
        },
        { merge: true }
      ),
      setDoc(
        summaryRef,
        {
          id: 'totals',
          total: increment(1),
          app: increment(isApp ? 1 : 0),
          web: increment(isApp ? 0 : 1),
          updatedAt: nowIso,
        },
        { merge: true }
      ),
    ]);

    // Mark today as recorded for this device/browser
    try {
      window.localStorage.setItem(storageKey, '1');
    } catch {
      // Storage quota or privacy mode fallback
    }
  } catch (err) {
    // Silently handle offline/network errors without degrading traveler UX
    console.warn('[Analytics] Failed to record daily visit:', err);
  }
}

/**
 * Computes windowed periods (7 days and 30 days) from the daily records list.
 */
function computePeriodSums(records: DailyAnalyticsRecord[], daysCount: number): AnalyticsPeriodSummary {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysCount);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  return records
    .filter((r) => r.date >= cutoffIso)
    .reduce(
      (acc, r) => ({
        total: acc.total + (r.total || 0),
        app: acc.app + (r.app || 0),
        web: acc.web + (r.web || 0),
      }),
      { total: 0, app: 0, web: 0 }
    );
}

/**
 * Real-time subscription to platform visitor analytics for General Manager.
 * Returns unsubscribe callback.
 */
export function subscribePlatformAnalytics(
  callback: (state: AnalyticsDashboardState) => void
): () => void {
  let totalsData: AnalyticsSummaryTotals = { id: 'totals', total: 0, app: 0, web: 0 };
  let dailyList: DailyAnalyticsRecord[] = [];
  let isTotalsLoaded = false;
  let isDailyLoaded = false;

  const todayIso = new Date().toISOString().slice(0, 10);

  const notify = () => {
    const todayRecord =
      dailyList.find((r) => r.date === todayIso) || {
        date: todayIso,
        total: 0,
        app: 0,
        web: 0,
      };

    const last7Days = computePeriodSums(dailyList, 7);
    const last30Days = computePeriodSums(dailyList, 30);

    callback({
      today: todayRecord,
      last7Days,
      last30Days,
      allTime: totalsData,
      dailyRecords: dailyList,
      isLoading: !isTotalsLoaded || !isDailyLoaded,
      lastUpdatedIso: new Date().toISOString(),
    });
  };

  // 1. Subscribe to all-time summary totals
  const summaryRef = doc(db, 'analytics_summary', 'totals');
  const unsubSummary = onSnapshot(
    summaryRef,
    (snap) => {
      isTotalsLoaded = true;
      if (snap.exists()) {
        const d = snap.data();
        totalsData = {
          id: 'totals',
          total: Number(d.total || 0),
          app: Number(d.app || 0),
          web: Number(d.web || 0),
          updatedAt: d.updatedAt ? String(d.updatedAt) : undefined,
        };
      }
      notify();
    },
    (err) => {
      console.warn('[Analytics] Totals subscription error:', err);
      isTotalsLoaded = true;
      notify();
    }
  );

  // 2. Subscribe to last 30 daily records
  const dailyCol = collection(db, 'analytics_daily');
  const dailyQuery = query(dailyCol, orderBy('date', 'desc'), limit(30));
  const unsubDaily = onSnapshot(
    dailyQuery,
    (snap) => {
      isDailyLoaded = true;
      dailyList = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          date: String(d.date || docSnap.id),
          total: Number(d.total || 0),
          app: Number(d.app || 0),
          web: Number(d.web || 0),
          updatedAt: d.updatedAt ? String(d.updatedAt) : undefined,
        };
      });
      notify();
    },
    (err) => {
      console.warn('[Analytics] Daily records subscription error:', err);
      isDailyLoaded = true;
      notify();
    }
  );

  return () => {
    unsubSummary();
    unsubDaily();
  };
}

/**
 * Direct one-off fetch for visitor analytics data.
 */
export async function fetchPlatformAnalytics(): Promise<AnalyticsDashboardState> {
  const todayIso = new Date().toISOString().slice(0, 10);
  try {
    const summaryRef = doc(db, 'analytics_summary', 'totals');
    const dailyCol = collection(db, 'analytics_daily');
    const dailyQuery = query(dailyCol, orderBy('date', 'desc'), limit(30));

    const [summarySnap, dailySnap] = await Promise.all([
      getDoc(summaryRef),
      getDocs(dailyQuery),
    ]);

    let totalsData: AnalyticsSummaryTotals = { id: 'totals', total: 0, app: 0, web: 0 };
    if (summarySnap.exists()) {
      const d = summarySnap.data();
      totalsData = {
        id: 'totals',
        total: Number(d.total || 0),
        app: Number(d.app || 0),
        web: Number(d.web || 0),
        updatedAt: d.updatedAt ? String(d.updatedAt) : undefined,
      };
    }

    const dailyList: DailyAnalyticsRecord[] = dailySnap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        date: String(d.date || docSnap.id),
        total: Number(d.total || 0),
        app: Number(d.app || 0),
        web: Number(d.web || 0),
        updatedAt: d.updatedAt ? String(d.updatedAt) : undefined,
      };
    });

    const todayRecord =
      dailyList.find((r) => r.date === todayIso) || {
        date: todayIso,
        total: 0,
        app: 0,
        web: 0,
      };

    return {
      today: todayRecord,
      last7Days: computePeriodSums(dailyList, 7),
      last30Days: computePeriodSums(dailyList, 30),
      allTime: totalsData,
      dailyRecords: dailyList,
      isLoading: false,
      lastUpdatedIso: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[Analytics] Failed to fetch analytics data:', err);
    return {
      ...DEFAULT_ANALYTICS_STATE,
      isLoading: false,
    };
  }
}
