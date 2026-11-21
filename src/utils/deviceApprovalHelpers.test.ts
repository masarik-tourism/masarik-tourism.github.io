import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConnectedSessionsView,
  collectPendingApprovalRequests,
  computeRevokeTrustedDeviceState,
  evaluateApprovalDocResponse,
  evaluateClientProfileApproval,
  evaluateNewDeviceVerifyUpdate,
  isApprovedStatus,
} from './deviceApprovalHelpers';

test('isApprovedStatus accepts approved, approved_trusted, approved_temporary, and approved* variants', () => {
  assert.equal(isApprovedStatus('approved'), true);
  assert.equal(isApprovedStatus('approved_trusted'), true);
  assert.equal(isApprovedStatus('approved_temporary'), true);
  assert.equal(isApprovedStatus('approved_custom'), true);
  assert.equal(isApprovedStatus('pending'), false);
  assert.equal(isApprovedStatus('rejected'), false);
  assert.equal(isApprovedStatus('blocked'), false);
});

test('evaluateClientProfileApproval unlocks immediately when deviceId appears in trustedDevices even if pendingDevices is stale', () => {
  const res = evaluateClientProfileApproval(
    {
      trustedDevices: [
        {
          deviceId: 'dev_new_123456',
          label: 'Android',
          addedAt: '2026-11-21T00:00:00.000Z',
          lastUsedAt: '2026-11-21T00:00:00.000Z',
        },
      ],
      pendingDevices: [
        {
          requestId: 'req_1',
          deviceId: 'dev_new_123456',
          deviceName: 'Android',
          status: 'pending',
          createdAt: '2026-11-21T00:00:00.000Z',
          expiresAt: '2026-11-21T00:10:00.000Z',
        },
      ],
    },
    'dev_new_123456',
    'req_1'
  );
  assert.equal(res.outcome, 'approved');
  assert.equal(res.approvalMode, 'trusted');
});

test('evaluateClientProfileApproval unlocks immediately when deviceId appears in non-expired activeSessions', () => {
  const now = Date.UTC(2026, 10, 21, 10, 0, 0);
  const res = evaluateClientProfileApproval(
    {
      activeSessions: [
        {
          sessionId: 'sess_temp_99',
          deviceId: 'dev_new_123456',
          deviceName: 'iPhone',
          mode: 'temporary',
          loggedInAt: new Date(now - 5000).toISOString(),
          lastActiveAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 3600_000).toISOString(),
        },
      ],
    },
    'dev_new_123456',
    'req_99',
    now
  );
  assert.equal(res.outcome, 'approved');
  assert.equal(res.approvalMode, 'temporary');
  assert.equal(res.existingSessionId, 'sess_temp_99');
});

test('evaluateClientProfileApproval falls through a stale pendingDevices entry to find an approved pendingLoginRequests entry', () => {
  const res = evaluateClientProfileApproval(
    {
      pendingDevices: [
        {
          requestId: 'req_2',
          deviceId: 'dev_new_123456',
          deviceName: 'Windows PC',
          status: 'pending',
          createdAt: '2026-11-21T00:00:00.000Z',
          expiresAt: '2026-11-21T00:10:00.000Z',
        },
      ],
      pendingLoginRequests: [
        {
          requestId: 'req_2',
          deviceId: 'dev_new_123456',
          deviceLabel: 'Windows PC',
          status: 'approved',
          approvalMode: 'trusted',
          createdAt: '2026-11-21T00:00:00.000Z',
          expiresAt: '2026-11-21T00:10:00.000Z',
        },
      ],
    },
    'dev_new_123456',
    'req_2'
  );
  assert.equal(res.outcome, 'approved');
  assert.equal(res.approvalMode, 'trusted');
});

test('evaluateApprovalDocResponse handles approved, approved_trusted, approved_temporary, and blocked', () => {
  assert.deepEqual(
    evaluateApprovalDocResponse({ status: 'approved' }),
    { outcome: 'approved', approvalMode: 'trusted', temporaryDurationHours: undefined }
  );
  assert.deepEqual(
    evaluateApprovalDocResponse({ status: 'approved_trusted' }),
    { outcome: 'approved', approvalMode: 'trusted', temporaryDurationHours: undefined }
  );
  const tempRes = evaluateApprovalDocResponse({
    status: 'approved_temporary',
    approvalMode: 'temporary',
    temporaryDurationHours: 24,
  });
  assert.equal(tempRes.outcome, 'approved');
  assert.equal(tempRes.approvalMode, 'temporary');
  assert.equal(tempRes.temporaryDurationHours, 24);
  assert.equal(tempRes.customExpiresAtMs, undefined);

  assert.deepEqual(evaluateApprovalDocResponse({ status: 'blocked' }), { outcome: 'blocked' });
});

test('evaluateNewDeviceVerifyUpdate unlocks even when idle if deviceId appears in trustedDevices or activeSessions', () => {
  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  const idleTrusted = evaluateNewDeviceVerifyUpdate({
    approvalRequestState: 'idle',
    profile: {
      trustedDevices: [
        {
          deviceId: 'dev_idle_1',
          label: 'Android',
          addedAt: new Date(now).toISOString(),
          lastUsedAt: new Date(now).toISOString(),
        },
      ],
    },
    currentDeviceId: 'dev_idle_1',
    nowMs: now,
  });
  assert.equal(idleTrusted.outcome, 'approved');
  assert.equal(idleTrusted.approvalMode, 'trusted');

  const idleRejectedIgnored = evaluateNewDeviceVerifyUpdate({
    approvalRequestState: 'idle',
    profile: {
      pendingDevices: [
        {
          requestId: 'req_old',
          deviceId: 'dev_idle_1',
          deviceName: 'Android',
          status: 'rejected',
          createdAt: new Date(now - 60_000).toISOString(),
          expiresAt: new Date(now + 60_000).toISOString(),
        },
      ],
    },
    currentDeviceId: 'dev_idle_1',
    nowMs: now,
  });
  assert.equal(idleRejectedIgnored.outcome, 'pending');
});

test('collectPendingApprovalRequests deduplicates across sources, ignores responded & current device requests', () => {
  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  const items = collectPendingApprovalRequests({
    phone: '201001234567',
    currentDeviceId: 'dev_trusted_host',
    dismissedRequestIds: ['req_dismissed'],
    nowMs: now,
    pendingDevices: [
      {
        requestId: 'req_live',
        deviceId: 'dev_other_1',
        deviceName: 'iPhone (Safari)',
        status: 'pending',
        createdAt: new Date(now - 1000).toISOString(),
        expiresAt: new Date(now + 300_000).toISOString(),
      },
      {
        requestId: 'req_done',
        deviceId: 'dev_other_2',
        deviceName: 'Mac (Chrome)',
        status: 'pending',
        createdAt: new Date(now - 2000).toISOString(),
        expiresAt: new Date(now + 300_000).toISOString(),
      },
    ],
    cloudDeviceApprovals: [
      {
        requestId: 'req_done',
        deviceId: 'dev_other_2',
        deviceName: 'Mac (Chrome)',
        status: 'approved_trusted',
        createdAt: new Date(now - 2000).toISOString(),
        expiresAt: new Date(now + 300_000).toISOString(),
      },
      {
        requestId: 'req_same_dev',
        deviceId: 'dev_trusted_host',
        deviceName: 'My Phone',
        status: 'pending',
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 300_000).toISOString(),
      },
    ],
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].requestId, 'req_live');
});

test('computeRevokeTrustedDeviceState removes device from trustedDevices and activeSessions without adding to blockedDevices', () => {
  const next = computeRevokeTrustedDeviceState(
    {
      trustedDevices: [
        { deviceId: 'dev_keep', label: 'A', addedAt: '2026-11-21', lastUsedAt: '2026-11-21' },
        { deviceId: 'dev_remove', label: 'B', addedAt: '2026-11-21', lastUsedAt: '2026-11-21' },
      ],
      activeSessions: [
        {
          sessionId: 's1',
          deviceId: 'dev_keep',
          deviceName: 'A',
          mode: 'trusted',
          loggedInAt: '2026-11-21',
          lastActiveAt: '2026-11-21',
          expiresAt: null,
        },
        {
          sessionId: 's2',
          deviceId: 'dev_remove',
          deviceName: 'B',
          mode: 'trusted',
          loggedInAt: '2026-11-21',
          lastActiveAt: '2026-11-21',
          expiresAt: null,
        },
      ],
      blockedDevices: ['dev_old_blocked'],
    },
    'dev_remove'
  );

  assert.deepEqual(
    next.trustedDevices.map((d) => d.deviceId),
    ['dev_keep']
  );
  assert.deepEqual(
    next.activeSessions.map((s) => s.deviceId),
    ['dev_keep']
  );
  assert.deepEqual(next.blockedDevices, ['dev_old_blocked']);
});

test('buildConnectedSessionsView marks temporary or untrusted sessions as not trusted so Trust Permanently button always renders', () => {
  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  const view = buildConnectedSessionsView(
    [],
    [],
    {
      sessionId: 'sess_local_temp',
      phone: '201001234567',
      mode: 'temporary',
      deviceId: 'dev_pin_temp',
      startedAt: now - 10_000,
      expiresAt: now + 3590_000,
      persistInLocalStorage: false,
      cloudRegistered: false,
    },
    { deviceId: 'dev_pin_temp', label: 'Android (Chrome)' },
    now
  );

  assert.equal(view.length, 1);
  assert.equal(view[0].isThisSession, true);
  assert.equal(view[0].isTrustedMode, false);
});

test('buildConnectedSessionsView marks a session as untrusted if deviceId is missing from trustedDevices even if session mode says trusted', () => {
  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  const view = buildConnectedSessionsView(
    [
      {
        sessionId: 'sess_1',
        deviceId: 'dev_abc',
        deviceName: 'iPhone',
        mode: 'trusted',
        loggedInAt: new Date(now - 1000).toISOString(),
        lastActiveAt: new Date(now).toISOString(),
        expiresAt: null,
      },
    ],
    [],
    {
      sessionId: 'sess_1',
      phone: '201001234567',
      mode: 'trusted',
      deviceId: 'dev_abc',
      startedAt: now - 1000,
      expiresAt: null,
    },
    { deviceId: 'dev_abc', label: 'iPhone' },
    now
  );

  assert.equal(view.length, 1);
  assert.equal(view[0].isTrustedMode, false);
});
