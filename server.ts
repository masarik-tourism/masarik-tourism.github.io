import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import { evaluatePassportValidity } from './src/utils/passportValidity';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '25mb' }));

interface FirebaseAppletConfigJson {
  projectId?: string;
  firestoreDatabaseId?: string;
}

let cachedAppletConfig: FirebaseAppletConfigJson | null = null;
function getFirebaseAppletConfig(): FirebaseAppletConfigJson {
  if (cachedAppletConfig) return cachedAppletConfig;
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf8');
    cachedAppletConfig = JSON.parse(raw) as FirebaseAppletConfigJson;
  } catch {
    cachedAppletConfig = {};
  }
  return cachedAppletConfig;
}

let cachedFirestoreGeminiKey: { key: string; fetchedAt: number } | null = null;

async function fetchGeminiKeyFromFirestore(): Promise<string> {
  if (cachedFirestoreGeminiKey && Date.now() - cachedFirestoreGeminiKey.fetchedAt < 10_000) {
    return cachedFirestoreGeminiKey.key;
  }
  try {
    const cfg = getFirebaseAppletConfig();
    if (!cfg.projectId) return '';
    const dbId = cfg.firestoreDatabaseId || '(default)';
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      cfg.projectId
    )}/databases/${encodeURIComponent(dbId)}/documents/site_config/general`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return '';
    const json = (await res.json()) as {
      fields?: { geminiApiKey?: { stringValue?: string } };
    };
    const key = String(json?.fields?.geminiApiKey?.stringValue || '').trim();
    cachedFirestoreGeminiKey = { key, fetchedAt: Date.now() };
    return key;
  } catch {
    return '';
  }
}

const GEMINI_PRIMARY_MODEL = 'gemini-3.8-flash';
const GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_MODEL_CANDIDATES = [GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL] as const;

async function resolveGeminiClient(): Promise<{ ai: GoogleGenAI | null; source: 'firestore' | 'env' | 'none' }> {
  const firestoreKey = await fetchGeminiKeyFromFirestore();
  const envKey = String(process.env.GEMINI_API_KEY || '').trim();
  const apiKey = firestoreKey || envKey;
  if (!apiKey) {
    return { ai: null, source: 'none' };
  }
  return {
    ai: new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    }),
    source: firestoreKey ? 'firestore' : 'env',
  };
}

async function generateContentWithModelFallback(
  ai: GoogleGenAI,
  request: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>
) {
  let lastError: unknown;
  for (const model of GEMINI_MODEL_CANDIDATES) {
    try {
      return await ai.models.generateContent({
        ...request,
        model,
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to generate content with Gemini models.');
}

app.post('/api/passport-check', async (req, res) => {
  try {
    const { ai } = await resolveGeminiClient();
    if (!ai) {
      res.status(400).json({
        noKeyConfigured: true,
        error:
          'مفتاح Gemini API غير مهيأ بعد. يرجى إضافته من لوحة الإدارة (الإعدادات العامة) أو عبر GEMINI_API_KEY.',
      });
      return;
    }

    const body = req.body as {
      imageBase64?: string;
      mimeType?: string;
      visaType?: string;
      lang?: 'ar' | 'en';
    };

    const isEn = body.lang === 'en';
    const rawBase64 = (body.imageBase64 || '').trim();
    const incomingMime = (body.mimeType || 'image/jpeg').trim().toLowerCase();
    const mimeType =
      incomingMime === 'application/pdf' || incomingMime.startsWith('image/')
        ? incomingMime
        : 'image/jpeg';
    const visaType = (
      body.visaType || (isEn ? 'Saudi Visa / Tasheer' : 'تأشيرة السعودية / تساهيل')
    ).trim();

    if (!rawBase64) {
      res.status(400).json({
        error: isEn
          ? 'Please attach a photo or PDF of the passport or visa document first.'
          : 'يرجى إرفاق صورة أو ملف PDF للجواز أو مستند التأشيرة أولاً.',
      });
      return;
    }

    const cleanBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
    const todayIso = new Date().toISOString().slice(0, 10);

    const promptText = isEn
      ? `You are an expert travel document, passport, and Saudi Visa / MOFA Visit Invitation analyst at "Masarik Tourism LLC".
Today's date is: ${todayIso}.
Requested visa/service context: ${visaType}.

Analyze the attached file carefully (it can be an image OR a multi/single-page PDF):
1. File clarity & readability:
   - isReadable: true if key text/numbers are legible, else false.
   - clarityStatus: "clear" | "blurry" | "cropped" | "unclear".
   - clarityIssueAr / clarityIssueEn: empty string "" if clear, otherwise concise instructions to upload a clearer scan.

2. Automatically classify the document type:
   - detectedDocumentKind:
     * "passport" if the file is a passport bio-data / MRZ page.
     * "saudi_visa" if the file is a Saudi Visa, MOFA Visit Invitation (مستند تأشيرة / زيارة عائلية أو شخصية / مستند دعوة وزارة الخارجية), Enjaz slip, or Tasheer visa document.
     * "other" for other travel documents.
   - documentType: descriptive label in the requested language (e.g., "Passport", "Saudi Visit Visa Document", "Enjaz Application").

3. If it is a PASSPORT (or contains passport details), extract accurately (using MRZ when present):
   - passportFullNameEn / fullName: English/Latin full name exactly as printed on passport.
   - passportFullNameAr: Arabic full name if printed on passport (else "").
   - passportNumber: uppercase passport number with no spaces (else "").
   - nationality: nationality (else "").
   - birthDate: YYYY-MM-DD (else "").
   - issueDate: YYYY-MM-DD (else "").
   - expiryDate: YYYY-MM-DD (else "").
   Calculate remainingDays from ${todayIso} to expiryDate and validate the 6-month (180+ days) rule.
   Set validityStatus: "valid_6m" | "warning_under_6m" | "expired" | "unclear".

4. If it is a SAUDI VISA / VISIT INVITATION DOCUMENT (or contains visa fields), extract accurately:
   - visaApplicationValidUntil: Gregorian date (YYYY-MM-DD) until which this visa document is valid for application (صلاحية هذا المستند للتقديم حتى), printed at the top/header of the document.
   - visaDocumentNumber: Document / Visa / Request Number (رقم المستند / رقم طلب الزيارة أو التأشيرة).
   - saudiSponsorId: Saudi Sponsor / Host Iqama ID, National ID, or Establishment/Border Number (رقم سجل/إقامة المستضيف السعودي).
   - sponsorName: Saudi Sponsor / Host full name (اسم المستضيف / صاحب الطلب).
   - sponsorPhone: Saudi Sponsor / Host phone number if printed (رقم جوال المستضيف).
   - applicantNameAr: Primary applicant name in Arabic (else "").
   - applicantNameEn: Primary applicant name in English if printed (else "").
   - documentPassportNumber: Primary applicant passport number (uppercase, no spaces, else "").
   - portOfEntry: Primary arrival / consulate / embarkation port (جهة القدوم مثل القاهرة / الإسكندرية / الرياض, else "").
   - visitorsList: Extract ALL persons listed in the "بيانات المطلوبين للزيارة" (List of Persons Requested for Visit) table. For each person extract:
     * name: full name of the visitor.
     * passportNumber: uppercase passport number.
     * portOfEntry: arrival/consulate port (e.g. القاهرة / الإسكندرية).
     * relationship: relation to sponsor (e.g. زوجة, ابن, ابنة, أم, أب, شقيق, etc.).
     * visaType: visa type (e.g. زيارة عائلية, شخصية, تجارية).
     * nationality: nationality.
   (Leave passport-specific fields empty "" if not present on the visa document, and visa fields empty "" if scanning a passport).

5. Write a clear Arabic summary in summaryAr, missing/next requirements in missingRequirements, and confidenceNote.`
      : `أنت خبير تحليل جوازات السفر ومستندات التأشيرات والزيارات السعودية في شركة "مسارك للإنجاز السياحي".
تاريخ اليوم الحالي هو: ${todayIso}.
سياق المعاملة / الخدمة: ${visaType}.

قم بفحص الملف المرفق بدقة (قد يكون صورة أو ملف PDF):
1. وضوح وقابلية قراءة الملف:
   - isReadable: true إذا كانت النصوص والأرقام مقروءة، وإلا false.
   - clarityStatus: "clear" إذا كان واضحاً، أو "blurry" (ضبابي)، أو "cropped" (مقصوص)، أو "unclear" (غير واضح).
   - clarityIssueAr / clarityIssueEn: نص فارغ "" إذا كان واضحاً، وإلا تنبيه واضح لإعادة رفع نسخة أوضح.

2. التعرّف التلقائي على نوع الملف المرفوع:
   - detectedDocumentKind:
     * "passport" إذا كان الملف جواز سفر.
     * "saudi_visa" إذا كان الملف مستند تأشيرة أو زيارة عائلية/شخصية صادرة من وزارة الخارجية السعودية أو مستند إنجاز/تساهيل.
     * "other" لأي مستند آخر.
   - documentType: وصف واضح لنوع المستند بالعربية (مثال: جواز سفر، مستند تأشيرة زيارة سعودية، إشعار إنجاز).

3. عند قراءة جواز السفر، استخرج بدقة بالغة (ومن سطر MRZ إن وجد):
   - passportFullNameEn و fullName: الاسم الكامل بالإنجليزية كما في الجواز (أو "" إن لم يكن جوازاً).
   - passportFullNameAr: الاسم الكامل بالعربية إن كان مطبوعاً في الجواز (أو "").
   - passportNumber: رقم الجواز بأحرف كبيرة بدون مسافات (أو "").
   - nationality: الجنسية.
   - birthDate: تاريخ الميلاد بصيغة ميلادية YYYY-MM-DD (أو "").
   - issueDate: تاريخ الإصدار بصيغة ميلادية YYYY-MM-DD (أو "").
   - expiryDate: تاريخ الانتهاء بصيغة ميلادية YYYY-MM-DD (أو "").
   واحسب الأيام المتبقية من ${todayIso} وحدد hasSixMonthsValidity و validityStatus ("valid_6m" | "warning_under_6m" | "expired" | "unclear").

4. عند قراءة مستند تأشيرة / زيارة سعودية، استخرج بدقة:
   - visaApplicationValidUntil: تاريخ صلاحية مستند التأشيرة للتقديم حتى (YYYY-MM-DD) المدوّن في أعلى المستند.
   - visaDocumentNumber: رقم المستند (رقم مستند التأشيرة أو طلب الزيارة).
   - saudiSponsorId: رقم سجل/إقامة المستضيف السعودي (أو رقم الهوية الوطنية/الإقامة).
   - sponsorName: اسم المستضيف / صاحب الطلب بالكامل.
   - sponsorPhone: رقم جوال المستضيف إن كان مدوّناً في المستند.
   - applicantNameAr: اسم صاحب الطلب / المطلوب بالزيارة باللغة العربية.
   - applicantNameEn: اسم صاحب الطلب بالإنجليزية إن وجد.
   - documentPassportNumber: رقم الجواز المدوّن داخل المستند (أحرف كبيرة بدون مسافات).
   - portOfEntry: جهة القدوم / القنصلية / مدينة الوصول (مثل: القاهرة، الإسكندرية، السويس، إلخ).
   - visitorsList: قائمة بكافة الأشخاص الموجودين في جدول "بيانات المطلوبين للزيارة" (شخص واحد أو عدة أفراد عائلة). واستخرج لكل فرد:
     * name: الاسم الكامل للشخص المطلوب بالزيارة.
     * passportNumber: رقم جواز سفره بأحرف كبيرة.
     * portOfEntry: جهة القدوم (مثل القاهرة / الإسكندرية).
     * relationship: صلة القرابة بالمستضيف (مثل: زوجة، ابن، ابنة، أم، أب، إلخ).
     * visaType: نوع التأشيرة (مثل: زيارة عائلية، شخصية، إلخ).
     * nationality: الجنسية.

5. اكتب ملخصاً عربياً واضحاً في summaryAr، وقائمة المتطلبات في missingRequirements، وملاحظة الثقة في confidenceNote.`;

    const response = await generateContentWithModelFallback(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          { text: promptText },
        ],
      },
      config: {
        systemInstruction: isEn
          ? 'Return strictly valid JSON matching the schema. Convert all parsed dates cleanly to YYYY-MM-DD. Never guess unreadable IDs, passport numbers, or dates.'
          : 'أرجع النتيجة بصيغة JSON مطابقة للمخطط فقط، وحوّل التواريخ المقروءة إلى YYYY-MM-DD، ولا تخمّن أرقاماً أو تواريخ غير مقروءة.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedDocumentKind: { type: Type.STRING },
            documentType: { type: Type.STRING },
            fullName: { type: Type.STRING },
            passportFullNameEn: { type: Type.STRING },
            passportFullNameAr: { type: Type.STRING },
            passportNumber: { type: Type.STRING },
            nationality: { type: Type.STRING },
            birthDate: { type: Type.STRING },
            issueDate: { type: Type.STRING },
            expiryDate: { type: Type.STRING },
            visaDocumentNumber: { type: Type.STRING },
            saudiSponsorId: { type: Type.STRING },
            sponsorName: { type: Type.STRING },
            sponsorPhone: { type: Type.STRING },
            visaApplicationValidUntil: { type: Type.STRING },
            applicantNameAr: { type: Type.STRING },
            applicantNameEn: { type: Type.STRING },
            documentPassportNumber: { type: Type.STRING },
            portOfEntry: { type: Type.STRING },
            visitorsList: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  passportNumber: { type: Type.STRING },
                  portOfEntry: { type: Type.STRING },
                  relationship: { type: Type.STRING },
                  visaType: { type: Type.STRING },
                  nationality: { type: Type.STRING },
                },
                required: ['name', 'passportNumber'],
              },
            },
            hasSixMonthsValidity: { type: Type.BOOLEAN },
            remainingDays: { type: Type.INTEGER },
            validityStatus: { type: Type.STRING },
            summaryAr: { type: Type.STRING },
            missingRequirements: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            confidenceNote: { type: Type.STRING },
            isReadable: { type: Type.BOOLEAN },
            clarityStatus: { type: Type.STRING },
            clarityIssueAr: { type: Type.STRING },
            clarityIssueEn: { type: Type.STRING },
          },
          required: [
            'detectedDocumentKind',
            'documentType',
            'fullName',
            'passportFullNameEn',
            'passportFullNameAr',
            'passportNumber',
            'nationality',
            'birthDate',
            'issueDate',
            'expiryDate',
            'visaDocumentNumber',
            'saudiSponsorId',
            'sponsorName',
            'sponsorPhone',
            'visaApplicationValidUntil',
            'applicantNameAr',
            'applicantNameEn',
            'documentPassportNumber',
            'portOfEntry',
            'visitorsList',
            'hasSixMonthsValidity',
            'remainingDays',
            'validityStatus',
            'summaryAr',
            'missingRequirements',
            'confidenceNote',
            'isReadable',
            'clarityStatus',
            'clarityIssueAr',
            'clarityIssueEn',
          ],
        },
      },
    });

    const rawText = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawText) as Record<string, unknown>;

    const isSaudiVisa = parsed.detectedDocumentKind === 'saudi_visa';
    if (isSaudiVisa) {
      // 1. 6-Month passport validity rule NEVER applies to Saudi Visa / Visit documents
      parsed.hasSixMonthsValidity = true;
      // 2. Validate visa application valid until date
      const validUntil = String(parsed.visaApplicationValidUntil || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
        if (validUntil < todayIso) {
          parsed.validityStatus = 'expired';
          parsed.hasSixMonthsValidity = false;
        } else {
          parsed.validityStatus = 'valid_6m';
          parsed.hasSixMonthsValidity = true;
        }
      } else {
        parsed.validityStatus = 'unclear';
      }

      // 3. Fallback compatibility for primary applicant fields from visitorsList
      const vList = Array.isArray(parsed.visitorsList) ? (parsed.visitorsList as Array<Record<string, unknown>>) : [];
      if (vList.length > 0) {
        if (!parsed.applicantNameAr && vList[0]?.name) {
          parsed.applicantNameAr = String(vList[0].name);
        }
        if (!parsed.documentPassportNumber && vList[0]?.passportNumber) {
          parsed.documentPassportNumber = String(vList[0].passportNumber);
        }
        if (!parsed.portOfEntry && vList[0]?.portOfEntry) {
          parsed.portOfEntry = String(vList[0].portOfEntry);
        }
      }
    } else {
      // 4. For passports: apply standard 6-month validity check
      const evalResult = evaluatePassportValidity(String(parsed.expiryDate || ''));
      if (evalResult.isValidFormat && evalResult.remainingDays !== null) {
        parsed.remainingDays = evalResult.remainingDays;
        parsed.hasSixMonthsValidity = !evalResult.isUnderSixMonths;
        parsed.validityStatus = evalResult.isExpired
          ? 'expired'
          : evalResult.isUnderSixMonths
          ? 'warning_under_6m'
          : 'valid_6m';
      }
    }
    res.json({ result: parsed });
  } catch (err: unknown) {
    const errorObj = err as { status?: number; message?: string };
    const status = typeof errorObj?.status === 'number' ? errorObj.status : 500;
    const message =
      errorObj?.message || 'حدث خطأ أثناء فحص المستند عبر خدمة الذكاء الاصطناعي.';
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
  }
});

app.post('/api/document-clarity-check', async (req, res) => {
  try {
    const { ai } = await resolveGeminiClient();
    if (!ai) {
      res.status(400).json({
        noKeyConfigured: true,
        error: 'Gemini API key is not configured.',
      });
      return;
    }

    const body = req.body as {
      imageBase64?: string;
      mimeType?: string;
      docCategory?: string;
      lang?: 'ar' | 'en';
    };

    const rawBase64 = (body.imageBase64 || '').trim();
    const mimeType = (body.mimeType || 'image/jpeg').trim();
    const docCategory = (body.docCategory || 'document').trim();
    if (!rawBase64 || !mimeType.startsWith('image/')) {
      res.json({
        result: { isClear: true, clarityStatus: 'clear', issueAr: '', issueEn: '' },
      });
      return;
    }

    const cleanBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
    const isPersonalPhoto = docCategory === 'avatar' || docCategory === 'photo';

    const promptText = isPersonalPhoto
      ? `Inspect this uploaded personal portrait/ID photo for travel/visa submission:
Determine if the face is clearly visible and in focus (not severely blurred, severely cropped/cut-off, extremely dark, or not containing a clear face).
Return JSON:
- isClear: true if acceptable/usable, false if blurry, cut-off, unreadable, or unusable for a travel profile/visa photo.
- clarityStatus: "clear" | "blurry" | "cropped" | "unclear".
- issueAr: concise Arabic warning telling the user to retake a clearer photo if isClear is false (empty string if clear).
- issueEn: concise English warning if isClear is false (empty string if clear).`
      : `Inspect this uploaded travel document (${docCategory}) image for clarity before submission:
Determine if text, numbers, barcodes, or details are reasonably readable, or if the photo is severely blurry, cropped at important edges, obscured by heavy glare, or too dark/illegible.
Return JSON:
- isClear: true if readable and usable, false if blurry, cropped, glare-obscured, or unreadable.
- clarityStatus: "clear" | "blurry" | "cropped" | "unclear".
- issueAr: concise Arabic warning telling the user what is wrong and to re-upload a clearer photo if isClear is false (empty string if clear).
- issueEn: concise English warning if isClear is false (empty string if clear).`;

    const response = await generateContentWithModelFallback(ai, {
      contents: {
        parts: [
          { inlineData: { mimeType, data: cleanBase64 } },
          { text: promptText },
        ],
      },
      config: {
        systemInstruction: 'Return strictly valid JSON evaluating image clarity accurately without false alarms on decent phone scans.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isClear: { type: Type.BOOLEAN },
            clarityStatus: { type: Type.STRING },
            issueAr: { type: Type.STRING },
            issueEn: { type: Type.STRING },
          },
          required: ['isClear', 'clarityStatus', 'issueAr', 'issueEn'],
        },
      },
    });

    const rawText = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawText);
    res.json({ result: parsed });
  } catch (err: unknown) {
    const errorObj = err as { status?: number; message?: string };
    const status = typeof errorObj?.status === 'number' ? errorObj.status : 500;
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: errorObj?.message || 'Clarity inspection error',
    });
  }
});

let cachedGoogleAccessToken: { token: string; expiresAtMs: number; projectId: string } | null = null;

function parseServiceAccountJson(rawInput: string): {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  token_uri?: string;
} | null {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed);
    }
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{')) {
      return JSON.parse(decoded);
    }
  } catch {
    return null;
  }
  return null;
}

async function getFcmOAuthToken(serviceAccountRaw: string): Promise<{
  token: string;
  projectId: string;
} | null> {
  try {
    const sa = parseServiceAccountJson(serviceAccountRaw);
    if (!sa || !sa.project_id || !sa.client_email || !sa.private_key) return null;

    if (
      cachedGoogleAccessToken &&
      cachedGoogleAccessToken.projectId === sa.project_id &&
      Date.now() < cachedGoogleAccessToken.expiresAtMs - 60_000
    ) {
      return {
        token: cachedGoogleAccessToken.token,
        projectId: cachedGoogleAccessToken.projectId,
      };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claim = Buffer.from(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
        iat: nowSec,
        exp: nowSec + 3600,
      })
    ).toString('base64url');

    const signInput = `${header}.${claim}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signInput);
    const signature = signer.sign(sa.private_key, 'base64url');
    const assertion = `${signInput}.${signature}`;

    const tokenRes = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!tokenRes.ok) return null;

    const tokenData = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
    if (!tokenData.access_token) return null;

    cachedGoogleAccessToken = {
      token: tokenData.access_token,
      projectId: sa.project_id,
      expiresAtMs: Date.now() + (tokenData.expires_in || 3600) * 1000,
    };

    return { token: tokenData.access_token, projectId: sa.project_id };
  } catch {
    return null;
  }
}

app.post('/api/push/send', async (req, res) => {
  try {
    const body = req.body as {
      tokens?: string[];
      title?: string;
      body?: string;
      data?: Record<string, string>;
    };
    const tokens = Array.isArray(body.tokens)
      ? Array.from(new Set(body.tokens.map((t) => String(t || '').trim()).filter(Boolean))).slice(
          0,
          15
        )
      : [];

    if (tokens.length === 0) {
      res.json({ ok: true, mode: 'no_tokens', sent: 0 });
      return;
    }

    const saJson = (
      process.env.FCM_SERVICE_ACCOUNT ||
      process.env.FCM_SERVICE_ACCOUNT_JSON ||
      ''
    ).trim();
    if (!saJson) {
      res.json({ ok: true, mode: 'client_realtime_only', sent: 0 });
      return;
    }

    const oauth = await getFcmOAuthToken(saJson);
    if (!oauth) {
      res.json({ ok: false, mode: 'oauth_unavailable', sent: 0 });
      return;
    }

    const cleanTitle = String(body.title || 'مسارك للإنجاز السياحي').slice(0, 160);
    const cleanBody = String(body.body || 'لديك إشعار جديد').slice(0, 400);
    const cleanData: Record<string, string> = {
      title: cleanTitle,
      body: cleanBody,
    };
    if (body.data && typeof body.data === 'object') {
      for (const [k, v] of Object.entries(body.data)) {
        cleanData[String(k).slice(0, 40)] = String(v ?? '').slice(0, 400);
      }
    }

    let sent = 0;
    await Promise.all(
      tokens.map(async (token) => {
        try {
          const fcmRes = await fetch(
            `https://fcm.googleapis.com/v1/projects/${oauth.projectId}/messages:send`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${oauth.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: {
                  token,
                  notification: {
                    title: cleanTitle,
                    body: cleanBody,
                  },
                  data: cleanData,
                  android: {
                    priority: 'high',
                    notification: {
                      sound: 'default',
                    },
                  },
                  webpush: {
                    headers: {
                      Urgency: 'high',
                    },
                    notification: {
                      icon: '/pwa-192x192.png',
                      badge: '/pwa-192x192.png',
                      dir: 'rtl',
                      lang: 'ar',
                      vibrate: [240, 110, 240],
                      requireInteraction: true,
                    },
                    fcm_options: {
                      link: cleanData.url || '/',
                    },
                  },
                },
              }),
            }
          );
          if (fcmRes.ok) sent += 1;
        } catch {
          // Ignore individual token failure
        }
      })
    );

    res.json({ ok: true, mode: 'fcm_http_v1', sent });
  } catch {
    res.status(200).json({ ok: false, mode: 'error', sent: 0 });
  }
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Masarik server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
