# Security Specification — Masarik Tourism Firestore Rules

## 1. Data Invariants
1. **Default-Deny Baseline:** Every unspecified Firestore path is denied (`allow read, write: if false;`).
2. **Client Phone Identity Integrity:** A document at `/clients/{phoneId}` must have `phoneId` matching `^[0-9]{8,20}$`, and `data.phone == phoneId` on creation and immutable across updates (`incoming().phone == existing().phone`).
3. **Immutable Creation Timestamp:** `createdAt` on `/clients/{phoneId}` cannot be modified on update.
4. **No Raw Image Blobs in Firestore:** `clients/{phoneId}.documents` is strictly bounded (`<= 30` entries) and checked at element level so multi-megabyte raw payloads cannot exhaust document limits; actual compressed files reside in Firebase Storage (`travelers/{phone}/documents/{docId}.jpg`).
5. **Valid Enum States Only:** `orderStatus` must strictly belong to `['تم استلام الأوراق', 'تم حجز موعد تساهيل', 'تحت المراجعة', 'صدرت التأشيرة']`, `announcementStyle` to `['gold', 'red', 'green']`, and admin `role` to `['super_admin', 'sub_admin']`.
6. **Strict Key & Size Bounds:** Every collection enforces `keys().hasAll(...)`, `keys().hasOnly(...)`, and explicit string `.size()` bounds to block shadow ghost fields and resource poisoning attacks.
7. **Master Admin Protection:** `/admins/master` cannot be deleted.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Arbitrary Collection Write:** Writing to `/unlisted_collection/doc1` -> Denied by default-deny rule.
2. **ID Poisoning on Clients:** Creating `/clients/../../etc/passwd` or a 500-char ID -> Denied by `isValidPhoneId(phoneId)`.
3. **Phone Mismatch:** Creating `/clients/201012345678` with `data.phone = "201199999999"` -> Denied by `data.phone == phoneId`.
4. **Shadow Ghost Field Injection:** Creating a client with extra field `isSuperAdmin: true` -> Denied by `keys().hasOnly(...)`.
5. **Invalid OTP Format:** Creating a client with `otp: "abc"` or `otp: "123"` -> Denied by `otp.matches('^[0-9]{6}$')`.
6. **Invalid Order Status Enum:** Updating `orderStatus` to `"Bypassed"` -> Denied by `orderStatus in [...]`.
7. **Immutable Field Tampering:** Updating `phone` or `createdAt` on an existing `/clients/{phoneId}` document -> Denied by immutability and `affectedKeys().hasOnly(...)`.
8. **Resource Exhaustion / 1MB String Poisoning:** Injecting a 10,000-character string into `name` or `adminNotes` -> Denied by `.size()` bounds.
9. **Unbounded Document Array Attack:** Pushing 35 items into `clients/{phoneId}.documents` -> Denied by `data.documents.size() <= 30`.
10. **Invalid Site Config Key:** Writing `/site_config/arbitrary_doc` -> Denied by `configId in ['general', 'cms']`.
11. **Malformed Admin PIN Hash:** Creating `/admins/sa-1` with invalid 4-char `pinHash` -> Denied by `pinHash.matches('^[a-f0-9]{64}$')`.
12. **Master Admin Deletion:** Deleting `/admins/master` -> Denied by `adminId != 'master'`.
