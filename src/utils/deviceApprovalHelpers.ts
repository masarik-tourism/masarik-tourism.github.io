import {
  ActiveSessionRecord,
  TravelerProfile,
  TravelerSessionMeta,
  TrustedDevice,
} from '../types/travel';

export interface ApprovalResolution {
  outcome: 'approved' | 'blocked' | 'rejected' | 'pending';
  approvalMode?: 'trusted' | 'temporary';
  temporaryDurationHours?: 1 | 24;
  customExpiresAtMs?: number | null;
  existingSessionId?: string;
}

export interface ConnectedSessionViewItem {
  session: ActiveSessionRecord;
  isThisSession: boolean;
  isTrustedMode: boolean;
}

export function isApprovedStatus(status: string | undefined | null): boolean {
  if (!status) return false;
  const normalized = String(status).trim().toLowerCase();
  return (
    normalized === 'approved' ||
    normalized === 'approved_trusted' ||
    normalized === 'approved_temporary' ||
    normalized.startsWith('approved')
  );
}

export function getRejectedOrBlockedOutcome(
  status: string | undefined | null
): 'blocked' | 'rejected' | null {
  if (!status) return null;
  const normalized = String(status).trim().toLowerCase();
  if (normalized === 'blocked') return 'blocked';
  if (normalized === 'rejected') return 'rejected';
  return null;
}

export function evaluateApprovalDocResponse(
  reqDoc: {
    status?: string;
    approvalMode?: 'trusted' | 'temporary';
    temporaryDurationHours?: 1 | 24;
    expiresAt?: string;
  } | null | undefined
): ApprovalResolution {
  if (!reqDoc) return { outcome: 'pending' };
  const statusStr = String(reqDoc.status || '').trim().toLowerCase();
  if (isApprovedStatus(statusStr)) {
    const isTemporary =
      statusStr === 'approved_temporary' || reqDoc.approvalMode === 'temporary';
    const hours: 1 | 24 = reqDoc.temporaryDurationHours === 24 ? 24 : 1;
    let customExpiresAtMs: number | null | undefined = undefined;
    if (isTemporary && reqDoc.expiresAt) {
      const parsed = Date.parse(reqDoc.expiresAt);
      if (Number.isFinite(parsed) && parsed > Date.now()) {
        customExpiresAtMs = parsed;
      }
    }
    return {
      outcome: 'approved',
      approvalMode: isTemporary ? 'temporary' : 'trusted',
      temporaryDurationHours: isTemporary ? hours : undefined,
      ...(customExpiresAtMs !== undefined ? { customExpiresAtMs } : {}),
    };
  }
  const negative = getRejectedOrBlockedOutcome(statusStr);
  if (negative) {
    return { outcome: negative };
  }
  return { outcome: 'pending' };
}

export function evaluateClientProfileApproval(
  profile: Pick<
    TravelerProfile,
    | 'blockedDevices'
    | 'trustedDevices'
    | 'activeSessions'
    | 'pendingDevices'
    | 'pendingLoginRequests'
  > | null | undefined,
  currentDeviceId: string,
  pendingApprovalReqId?: string | null,
  nowMs: number = Date.now()
): ApprovalResolution {
  if (!profile || !currentDeviceId) return { outcome: 'pending' };

  // 1. Blocked check takes priority
  if (
    Array.isArray(profile.blockedDevices) &&
    profile.blockedDevices.includes(currentDeviceId)
  ) {
    return { outcome: 'blocked' };
  }

  // 2. Device is already listed in trustedDevices -> immediately unlock as permanent trusted!
  if (
    Array.isArray(profile.trustedDevices) &&
    profile.trustedDevices.some((d) => d && d.deviceId === currentDeviceId)
  ) {
    const matchedSession = Array.isArray(profile.activeSessions)
      ? profile.activeSessions.find((s) => s && s.deviceId === currentDeviceId)
      : undefined;
    return {
      outcome: 'approved',
      approvalMode: 'trusted',
      ...(matchedSession?.sessionId ? { existingSessionId: matchedSession.sessionId } : {}),
    };
  }

  // 3. Device has a live non-expired session in activeSessions -> immediately unlock!
  if (Array.isArray(profile.activeSessions)) {
    const liveSession = profile.activeSessions.find((s) => {
      if (!s || s.deviceId !== currentDeviceId) return false;
      if (!s.expiresAt) return true;
      const expMs = Date.parse(s.expiresAt);
      return !Number.isFinite(expMs) || expMs > nowMs;
    });
    if (liveSession) {
      const isTemporary =
        liveSession.mode === 'temporary' && Boolean(liveSession.expiresAt);
      let hours: 1 | 24 = 1;
      let customExpiresAtMs: number | null = null;
      if (isTemporary && liveSession.expiresAt) {
        const expMs = Date.parse(liveSession.expiresAt);
        if (Number.isFinite(expMs)) {
          customExpiresAtMs = expMs;
          hours = expMs - nowMs > 6 * 3600 * 1000 ? 24 : 1;
        }
      }
      return {
        outcome: 'approved',
        approvalMode: isTemporary ? 'temporary' : 'trusted',
        ...(isTemporary ? { temporaryDurationHours: hours, customExpiresAtMs } : {}),
        existingSessionId: liveSession.sessionId,
      };
    }
  }

  // 4. Check pendingDevices (matching requestId first, or any non-pending match for this deviceId)
  if (Array.isArray(profile.pendingDevices)) {
    const candidates = profile.pendingDevices.filter(
      (r) =>
        r &&
        ((pendingApprovalReqId && r.requestId === pendingApprovalReqId) ||
          r.deviceId === currentDeviceId)
    );
    // Prefer exact requestId match if it is resolved, otherwise any resolved entry for this deviceId
    const resolved =
      candidates.find(
        (r) =>
          r.requestId === pendingApprovalReqId &&
          (isApprovedStatus(r.status) || getRejectedOrBlockedOutcome(r.status) !== null)
      ) ||
      candidates.find(
        (r) => isApprovedStatus(r.status) || getRejectedOrBlockedOutcome(r.status) !== null
      );

    if (resolved) {
      const res = evaluateApprovalDocResponse(resolved);
      if (res.outcome !== 'pending') return res;
    }
  }

  // 5. Check legacy pendingLoginRequests
  if (Array.isArray(profile.pendingLoginRequests)) {
    const candidates = profile.pendingLoginRequests.filter(
      (r) =>
        r &&
        ((pendingApprovalReqId && r.requestId === pendingApprovalReqId) ||
          r.deviceId === currentDeviceId)
    );
    const resolved =
      candidates.find(
        (r) =>
          r.requestId === pendingApprovalReqId &&
          (isApprovedStatus(r.status) || getRejectedOrBlockedOutcome(r.status) !== null)
      ) ||
      candidates.find(
        (r) => isApprovedStatus(r.status) || getRejectedOrBlockedOutcome(r.status) !== null
      );

    if (resolved) {
      const res = evaluateApprovalDocResponse({
        status: resolved.status,
        approvalMode: resolved.approvalMode,
        temporaryDurationHours: resolved.temporaryDurationHours,
        expiresAt: resolved.expiresAt,
      });
      if (res.outcome !== 'pending') return res;
    }
  }

  return { outcome: 'pending' };
}

export function buildConnectedSessionsView(
  activeSessions: ActiveSessionRecord[] | undefined,
  trustedDevices: TrustedDevice[] | undefined,
  sessionMeta: TravelerSessionMeta | null | undefined,
  currentDevice: { deviceId: string; label: string },
  nowMs: number = Date.now()
): ConnectedSessionViewItem[] {
  const validCloudSessions = (Array.isArray(activeSessions) ? activeSessions : []).filter((s) => {
    if (!s || !s.sessionId) return false;
    if (!s.expiresAt) return true;
    const expMs = Date.parse(s.expiresAt);
    return !Number.isFinite(expMs) || expMs > nowMs;
  });

  const hasCurrentInCloud = validCloudSessions.some(
    (s) =>
      (sessionMeta?.sessionId && s.sessionId === sessionMeta.sessionId) ||
      s.deviceId === currentDevice.deviceId
  );

  const combined: ActiveSessionRecord[] = [...validCloudSessions];

  // If the current device just logged in (e.g. temporary PIN/OTP session) before Firestore sync settled,
  // synthesize a live local session entry so the user always sees their session & "Trust Permanently" button.
  if (!hasCurrentInCloud && sessionMeta) {
    const startedIso = new Date(sessionMeta.startedAt || nowMs).toISOString();
    const isTemp = sessionMeta.mode === 'temporary';
    combined.unshift({
      sessionId:
        sessionMeta.sessionId || `sess_${currentDevice.deviceId.slice(0, 12)}_${nowMs}`,
      deviceId: currentDevice.deviceId,
      deviceName: currentDevice.label,
      mode: isTemp ? 'temporary' : 'trusted',
      loggedInAt: startedIso,
      lastActiveAt: startedIso,
      expiresAt:
        isTemp && typeof sessionMeta.expiresAt === 'number'
          ? new Date(sessionMeta.expiresAt).toISOString()
          : null,
    });
  }

  combined.sort((a, b) => {
    const aCurr =
      a.sessionId === sessionMeta?.sessionId || a.deviceId === currentDevice.deviceId ? 1 : 0;
    const bCurr =
      b.sessionId === sessionMeta?.sessionId || b.deviceId === currentDevice.deviceId ? 1 : 0;
    if (aCurr !== bCurr) return bCurr - aCurr;
    return (Date.parse(b.lastActiveAt) || 0) - (Date.parse(a.lastActiveAt) || 0);
  });

  return combined.map((sess) => {
    const isThisSession =
      Boolean(sessionMeta?.sessionId && sess.sessionId === sessionMeta.sessionId) ||
      sess.deviceId === currentDevice.deviceId;
    const isDeviceTrusted = Array.isArray(trustedDevices)
      ? trustedDevices.some((d) => d && d.deviceId === sess.deviceId)
      : false;
    const isTrustedMode = sess.mode === 'trusted' && !sess.expiresAt && isDeviceTrusted;
    return {
      session: sess,
      isThisSession,
      isTrustedMode,
    };
  });
}
