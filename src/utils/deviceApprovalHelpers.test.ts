import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConnectedSessionsView,
  evaluateApprovalDocResponse,
  evaluateClientProfileApproval,
  isApprovedStatus,
} from './deviceApprovalHelpers';

test('isApprovedStatus accepts approved, approved_trusted, approved_temporary, and approved* variants', () => {
  assert.equal(isApprovedStatus('approved'), true);
  assert.equal(isApprovedStatus('approved_trusted'), true);
  assert.equal(isApprovedStatus('approved_temporary'), true);
  assert.equal(isApprovedStatus('approved_once'), true);
  assert.equal(isApprovedStatus('APPROVED_TRUSTED'), true);
  assert.equal(isApprovedStatus('pending'), false);
  assert.equal(isApprovedStatus('rejected'), false);
  assert.equal(isApprovedStatus('blocked'), false);
  assert.equal(isApprovedStatus(undefined), false);
});

test('evaluateClientProfileApproval unlocks immediately when deviceId appears in trustedDevices even if pendingDevices is stale', () => {
  const res = evaluateClientProfileApproval(
    {
      trustedDevices: [
        {
          deviceId: 'dev_new_12345678',
          label: 'Android',
          addedAt: '2026-11-21T00:00:00Z',
          lastUsedAt: '2026-11-21T00:00:00Z',
        },
      ],
      pendingDevices: [
        {
          requestId: 'req_1',
          phoneId: '201112223334',
          deviceId: 'dev_new_12345678',
          deviceName: 'Android',
          status: 'pending',
          createdAt: '2026-11-21T00:00:00Z',
          expiresAt: '2026-11-21T00:10:00Z',
        },
      ],
    },
    'dev_new_12345678',
    'req_1'
  );

  assert.equal(res.outcome, 'approved');
  assert.equal(res.approvalMode, 'trusted');
});

test('evaluateClientProfileApproval unlocks immediately when deviceId appears in non-expired activeSessions', () => {
  const nowMs = Date.parse('2026-11-21T01:00:00Z');
  const res = evaluateClientProfileApproval(
    {
      trustedDevices: [],
      activeSessions: [
        {
          sessionId: 'sess_temp_1',
          deviceId: 'dev_new_12345678',
          deviceName: 'Chrome',
          mode: 'temporary',
          loggedInAt: '2026-11-21T01:00:00Z',
          lastActiveAt: '2026-11-21T01:00:00Z',
          expiresAt: '2026-11-21T02:00:00Z',
        },
      ],
      pendingDevices: [
        {
          requestId: 'req_1',
          phoneId: '201112223334',
          deviceId: 'dev_new_12345678',
          deviceName: 'Chrome',
          status: 'pending',
          createdAt: '2026-11-21T00:59:00Z',
          expiresAt: '2026-11-21T01:09:00Z',
        },
      ],
    },
    'dev_new_12345678',
    'req_1',
    nowMs
  );

  assert.equal(res.outcome, 'approved');
  assert.equal(res.approvalMode, 'temporary');
  assert.equal(res.existingSessionId, 'sess_temp_1');
});

test('evaluateClientProfileApproval falls through a stale pendingDevices entry to find an approved pendingLoginRequests entry', () => {
  const res = evaluateClientProfileApproval(
    {
      pendingDevices: [
        {
          requestId: 'req_old_pending',
          phoneId: '201112223334',
          deviceId: 'dev_new_12345678',
          deviceName: 'Chrome',
          status: 'pending',
          createdAt: '2026-11-21T00:00:00Z',
          expiresAt: '2026-11-21T00:10:00Z',
        },
      ],
      pendingLoginRequests: [
        {
          requestId: 'req_new_approved',
          deviceId: 'dev_new_12345678',
          deviceLabel: 'Chrome',
          status: 'approved',
          createdAt: '2026-11-21T00:01:00Z',
          expiresAt: '2026-11-21T00:11:00Z',
        },
      ],
    },
    'dev_new_12345678',
    'req_old_pending'
  );

  assert.equal(res.outcome, 'approved');
  assert.equal(res.approvalMode, 'trusted');
});

test('evaluateApprovalDocResponse handles approved, approved_trusted, approved_temporary, and blocked', () => {
  assert.deepEqual(
    evaluateApprovalDocResponse({
      status: 'approved',
      createdAt: '2026-11-21T00:00:00Z',
      expiresAt: '2026-11-21T00:10:00Z',
    } as never),
    { outcome: 'approved', approvalMode: 'trusted', temporaryDurationHours: undefined }
  );

  const temp = evaluateApprovalDocResponse({
    status: 'approved_temporary',
    approvalMode: 'temporary',
    temporaryDurationHours: 24,
    expiresAt: '2026-11-22T01:00:00Z',
  });
  assert.equal(temp.outcome, 'approved');
  assert.equal(temp.approvalMode, 'temporary');
  assert.equal(temp.temporaryDurationHours, 24);

  assert.equal(
    evaluateApprovalDocResponse({ status: 'blocked', expiresAt: '2026-11-21T00:10:00Z' }).outcome,
    'blocked'
  );
});

test('buildConnectedSessionsView marks temporary or untrusted sessions as not trusted so Trust Permanently button always renders', () => {
  const nowMs = Date.parse('2026-11-21T01:00:00Z');
  const view = buildConnectedSessionsView(
    undefined,
    [],
    {
      phone: '201112223334',
      deviceId: 'dev_temp_99999999',
      mode: 'temporary',
      startedAt: nowMs,
      expiresAt: nowMs + 3600_000,
      sessionId: 'sess_local_1',
    },
    { deviceId: 'dev_temp_99999999', label: 'Android (Chrome)' },
    nowMs
  );

  assert.equal(view.length, 1);
  assert.equal(view[0].isThisSession, true);
  assert.equal(view[0].isTrustedMode, false);
  assert.equal(view[0].session.mode, 'temporary');
});

test('buildConnectedSessionsView marks a session as untrusted if deviceId is missing from trustedDevices even if session mode says trusted', () => {
  const nowMs = Date.parse('2026-11-21T01:00:00Z');
  const view = buildConnectedSessionsView(
    [
      {
        sessionId: 'sess_cloud_1',
        deviceId: 'dev_untrusted_1111',
        deviceName: 'Windows PC (Chrome)',
        mode: 'trusted',
        loggedInAt: '2026-11-21T00:50:00Z',
        lastActiveAt: '2026-11-21T00:55:00Z',
        expiresAt: null,
      },
    ],
    [],
    {
      phone: '201112223334',
      deviceId: 'dev_untrusted_1111',
      mode: 'trusted',
      startedAt: nowMs,
      expiresAt: null,
      sessionId: 'sess_cloud_1',
    },
    { deviceId: 'dev_untrusted_1111', label: 'Windows PC (Chrome)' },
    nowMs
  );

  assert.equal(view.length, 1);
  assert.equal(view[0].isTrustedMode, false);
});
