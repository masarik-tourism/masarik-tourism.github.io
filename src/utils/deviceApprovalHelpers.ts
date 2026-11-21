import {
  ActiveSessionRecord,
  PendingDeviceRequest,
  PendingLoginRequest,
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
  reqDoc:
    | {
        status?: string;
        approvalMode?: 'trusted' | 'temporary';
        temporaryDurationHours?: 1 | 24;
        expiresAt?: string;
        respondedAt?: string;
      }
    | null
    | undefined
): ApprovalResolution {
  if (!reqDoc) return { outcome: 'pending' };
  const statusStr = String(reqDoc.status || '').trim().toLowerCase();
  if (isApprovedStatus(statusStr)) {
    const isTemporary =
      statusStr === 'approved_temporary' || reqDoc.approvalMode === 'temporary';
    const hours: 1 | 24 = reqDoc.temporaryDurationHours === 24 ? 24 : 1;
    let customExpiresAtMs: number | null | undefined = undefined;
    // Only treat reqDoc.expiresAt as session expiry if respondedAt is set (otherwise it's the 10-min request TTL)
    if (isTemporary && reqDoc.respondedAt && reqDoc.expiresAt) {
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
  profile:
    | Pick<
        TravelerProfile,
        | 'blockedDevices'
        | 'trustedDevices'
        | 'activeSessions'
        | 'pendingDevices'
        | 'pendingLoginRequests'
      >
    | null
    | undefined,
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
        respondedAt: resolved.respondedAt,
      });
      if (res.outcome !== 'pending') return res;
    }
  }

  return { outcome: 'pending' };
}

/**
 * Evaluates incoming Firestore updates while the user is on the New Device Verification screen.
 * - When waiting for an approval request (`approvalRequestState === 'waiting'`): resolves on any
 *   approved/rejected/blocked signal across clients/{phone} and deviceApprovals.
 * - Even when idle (`approvalRequestState === 'idle'`): immediately unlocks if the current deviceId
 *   appears in trustedDevices or as a non-expired session in activeSessions.
 */
export function evaluateNewDeviceVerifyUpdate(params: {
  approvalRequestState: 'idle' | 'waiting' | 'rejected' | 'error';
  profile?: Pick<
    TravelerProfile,
    | 'blockedDevices'
    | 'trustedDevices'
    | 'activeSessions'
    | 'pendingDevices'
    | 'pendingLoginRequests'
  > | null;
  approvalDocs?: PendingDeviceRequest[] | null;
  currentDeviceId: string;
  pendingApprovalReqId?: string | null;
  nowMs?: number;
}): ApprovalResolution {
  const {
    approvalRequestState,
    profile,
    approvalDocs,
    currentDeviceId,
    pendingApprovalReqId,
    nowMs = Date.now(),
  } = params;

  if (!currentDeviceId) return { outcome: 'pending' };

  if (approvalRequestState === 'waiting') {
    if (Array.isArray(approvalDocs) && approvalDocs.length > 0) {
      const exactMatch = pendingApprovalReqId
        ? approvalDocs.find((d) => d && d.requestId === pendingApprovalReqId)
        : undefined;
      if (exactMatch) {
        const res = evaluateApprovalDocResponse(exactMatch);
        if (res.outcome !== 'pending') return res;
      }
      const deviceMatch = approvalDocs.find(
        (d) =>
          d &&
          d.deviceId === currentDeviceId &&
          evaluateApprovalDocResponse(d).outcome !== 'pending'
      );
      if (deviceMatch) {
        const res = evaluateApprovalDocResponse(deviceMatch);
        if (res.outcome !== 'pending') return res;
      }
    }
    if (profile) {
      return evaluateClientProfileApproval(
        profile,
        currentDeviceId,
        pendingApprovalReqId,
        nowMs
      );
    }
    return { outcome: 'pending' };
  }

  // Even while idle on new_device_verify, unlock immediately if deviceId appears in trustedDevices or activeSessions
  if (profile) {
    if (
      Array.isArray(profile.trustedDevices) &&
      profile.trustedDevices.some((d) => d && d.deviceId === currentDeviceId)
    ) {
      return evaluateClientProfileApproval(profile, currentDeviceId, null, nowMs);
    }
    if (
      Array.isArray(profile.activeSessions) &&
      profile.activeSessions.some((s) => {
        if (!s || s.deviceId !== currentDeviceId) return false;
        if (!s.expiresAt) return true;
        const expMs = Date.parse(s.expiresAt);
        return !Number.isFinite(expMs) || expMs > nowMs;
      })
    ) {
      return evaluateClientProfileApproval(profile, currentDeviceId, null, nowMs);
    }
  }

  return { outcome: 'pending' };
}

/**
 * Deduplicates and filters pending login approval requests across deviceApprovals,
 * clients/{phone}.pendingDevices, and legacy pendingLoginRequests.
 */
export function collectPendingApprovalRequests(params: {
  phone: string;
  pendingDevices?: PendingDeviceRequest[];
  pendingLoginRequests?: PendingLoginRequest[];
  cloudDeviceApprovals?: PendingDeviceRequest[];
  currentDeviceId: string;
  dismissedRequestIds?: string[];
  nowMs?: number;
}): PendingDeviceRequest[] {
  const {
    phone,
    pendingDevices = [],
    pendingLoginRequests = [],
    cloudDeviceApprovals = [],
    currentDeviceId,
    dismissedRequestIds = [],
    nowMs = Date.now(),
  } = params;

  const byId = new Map<string, PendingDeviceRequest>();
  const addCandidate = (item: PendingDeviceRequest | undefined | null) => {
    if (!item || !item.requestId) return;
    const existing = byId.get(item.requestId);
    if (!existing || (existing.status === 'pending' && item.status !== 'pending')) {
      byId.set(item.requestId, item);
    }
  };

  pendingDevices.forEach(addCandidate);
  pendingLoginRequests.forEach((r) => {
    if (!r) return;
    addCandidate({
      requestId: r.requestId,
      phoneId: phone,
      deviceId: r.deviceId,
      deviceName: r.deviceLabel,
      status: (r.status === 'approved'
        ? 'approved_trusted'
        : r.status) as PendingDeviceRequest['status'],
      approvalMode: r.approvalMode,
      temporaryDurationHours: r.temporaryDurationHours,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      respondedAt: r.respondedAt,
    });
  });
  cloudDeviceApprovals.forEach(addCandidate);

  return Array.from(byId.values())
    .filter((r) => {
      if (r.status !== 'pending') return false;
      if (r.deviceId === currentDeviceId) return false;
      const expMs = Date.parse(r.expiresAt);
      if (Number.isFinite(expMs) && expMs <= nowMs) return false;
      if (dismissedRequestIds.includes(r.requestId)) return false;
      return true;
    })
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

/**
 * Pure transition for deleting a Trusted Device from trustedDevices AND activeSessions
 * WITHOUT ever adding it to blockedDevices (allows clean re-login as a normal new device).
 */
export function computeRevokeTrustedDeviceState(
  profile: Pick<TravelerProfile, 'trustedDevices' | 'activeSessions' | 'blockedDevices'>,
  targetDeviceId: string
): {
  trustedDevices: TrustedDevice[];
  activeSessions: ActiveSessionRecord[];
  blockedDevices: string[];
} {
  const nextTrustedDevices = (Array.isArray(profile.trustedDevices)
    ? profile.trustedDevices
    : []
  ).filter((d) => d && d.deviceId !== targetDeviceId);

  const nextSessions = (Array.isArray(profile.activeSessions)
    ? profile.activeSessions
    : []
  ).filter((s) => s && s.deviceId !== targetDeviceId);

  const nextBlockedDevices = (Array.isArray(profile.blockedDevices)
    ? profile.blockedDevices
    : []
  ).filter((id) => id !== targetDeviceId);

  return {
    trustedDevices: nextTrustedDevices,
    activeSessions: nextSessions,
    blockedDevices: nextBlockedDevices,
  };
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
