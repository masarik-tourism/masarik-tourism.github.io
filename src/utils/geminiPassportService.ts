import {
  DetectedDocumentKind,
  DocumentClarityCheckResult,
  DocumentClarityStatus,
  PassportAiCheckResult,
} from '../types/travel';
import { evaluatePassportValidity } from './passportValidity';
import { fetchSiteConfigFromCloud, getSiteConfig } from './siteConfigStore';

const GEMINI_PRIMARY_MODEL = 'gemini-3.8-flash';
const GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_MODEL_CANDIDATES = [GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL] as const;

export interface GeminiPassportCallResponse {
  ok: boolean;
  result?: PassportAiCheckResult;
  noKeyConfigured?: boolean;
  error?: string;
}

export interface GeminiClarityCallResponse {
  ok: boolean;
  result?: DocumentClarityCheckResult;
  noKeyConfigured?: boolean;
  error?: string;
}

function normalizeIsoDate(raw: unknown): string {
  const s = String(raw || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function inferDetectedKind(raw: PassportAiCheckResult): DetectedDocumentKind {
  if (
    raw.detectedDocumentKind === 'passport' ||
    raw.detectedDocumentKind === 'saudi_visa' ||
    raw.detectedDocumentKind === 'other'
  ) {
    return raw.detectedDocumentKind;
  }
  if (
    (raw.visaDocumentNumber || '').trim() ||
    (raw.saudiSponsorId || '').trim() ||
    (raw.portOfEntry || '').trim()
  ) {
    return 'saudi_visa';
  }
  if ((raw.passportNumber || '').trim() || (raw.expiryDate || '').trim()) {
    return 'passport';
  }
  return 'other';
}

function normalizePassportAiResult(raw: PassportAiCheckResult): PassportAiCheckResult {
  const evalResult = evaluatePassportValidity(raw.expiryDate);
  const clarityStatus: DocumentClarityStatus =
    raw.clarityStatus === 'blurry' ||
    raw.clarityStatus === 'cropped' ||
    raw.clarityStatus === 'unclear'
      ? raw.clarityStatus
      : 'clear';

  const detectedDocumentKind = inferDetectedKind(raw);
  const passportFullNameEn = (raw.passportFullNameEn || raw.fullName || '').trim();
  const passportFullNameAr = (raw.passportFullNameAr || '').trim();
  const cleanFullName = (raw.fullName || passportFullNameEn || passportFullNameAr).trim();
  const cleanDocPassportNo = (raw.documentPassportNumber || '').trim().toUpperCase();
  const cleanPassportNo = (raw.passportNumber || '').trim().toUpperCase();

  const baseNormalized: PassportAiCheckResult = {
    ...raw,
    detectedDocumentKind,
    passportNumber: cleanPassportNo,
    fullName: cleanFullName,
    passportFullNameEn,
    passportFullNameAr,
    nationality: (raw.nationality || '').trim(),
    birthDate: normalizeIsoDate(raw.birthDate),
    issueDate: normalizeIsoDate(raw.issueDate),
    expiryDate: normalizeIsoDate(raw.expiryDate) || (raw.expiryDate || '').trim(),
    visaDocumentNumber: (raw.visaDocumentNumber || '').trim(),
    saudiSponsorId: (raw.saudiSponsorId || '').trim(),
    applicantNameAr: (raw.applicantNameAr || '').trim(),
    applicantNameEn: (raw.applicantNameEn || '').trim(),
    documentPassportNumber: cleanDocPassportNo,
    portOfEntry: (raw.portOfEntry || '').trim(),
    clarityStatus,
    isReadable: raw.isReadable !== false,
  };

  if (evalResult.isValidFormat && evalResult.remainingDays !== null) {
    return {
      ...baseNormalized,
      hasSixMonthsValidity: !evalResult.isUnderSixMonths,
      remainingDays: evalResult.remainingDays,
      validityStatus: evalResult.isExpired
        ? 'expired'
        : evalResult.isUnderSixMonths
        ? 'warning_under_6m'
        : 'valid_6m',
    };
  }

  return baseNormalized;
}

async function resolveFirestoreGeminiKey(): Promise<string> {
  const cached = String(getSiteConfig().geminiApiKey || '').trim();
  if (cached) return cached;
  try {
    const fresh = await fetchSiteConfigFromCloud();
    return String(fresh.geminiApiKey || '').trim();
  } catch {
    return '';
  }
}

async function postGeminiWithModelFallback<T>(
  apiKey: string,
  payload: Record<string, unknown>
): Promise<T> {
  let lastError: Error | null = null;

  for (const model of GEMINI_MODEL_CANDIDATES) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        lastError = new Error(errText || `Gemini API HTTP ${res.status}`);
        continue;
      }

      return (await res.json()) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(`Gemini API call failed for ${model}`);
    }
  }

  throw lastError || new Error('Gemini API request failed.');
}

async function callGeminiDirectPassportScan(
  apiKey: string,
  params: {
    imageBase64: string;
    mimeType: string;
    visaType?: string;
    lang: 'ar' | 'en';
  }
): Promise<PassportAiCheckResult> {
  const isEn = params.lang === 'en';
  const cleanBase64 = params.imageBase64.includes(',')
    ? params.imageBase64.split(',')[1]
    : params.imageBase64;
  const incomingMime = (params.mimeType || 'image/jpeg').trim().toLowerCase();
  const safeMimeType =
    incomingMime === 'application/pdf' || incomingMime.startsWith('image/')
      ? incomingMime
      : 'image/jpeg';
  const todayIso = new Date().toISOString().slice(0, 10);
  const visaType =
    (params.visaType || '').trim() || (isEn ? 'Saudi Visa / Tasheer' : 'تأشيرة السعودية / تساهيل');

  const promptText = isEn
    ? `You are an expert travel document, passport, and Saudi Visa / MOFA Visit Invitation analyst at "Masarik Tourism LLC".
Today's date is: ${todayIso}.
Requested visa/service context: ${visaType}.

Analyze the attached file carefully (image or PDF):
1. File clarity & readability:
   - isReadable: true if key text/numbers are legible, else false.
   - clarityStatus: "clear" | "blurry" | "cropped" | "unclear".
   - clarityIssueAr / clarityIssueEn: empty string "" if clear, else concise instructions to upload a clearer scan.

2. Automatically classify the document:
   - detectedDocumentKind: "passport" | "saudi_visa" | "other".
   - documentType: descriptive document label.

3. Passport fields (extract when it is a passport, else ""):
   - passportFullNameEn & fullName (English full name as printed on passport/MRZ)
   - passportFullNameAr (Arabic full name if printed on passport, else "")
   - passportNumber (uppercase, no spaces)
   - nationality
   - birthDate (YYYY-MM-DD or "")
   - issueDate (YYYY-MM-DD or "")
   - expiryDate (YYYY-MM-DD or "")
   Check 6-month (180+ days) validity from ${todayIso}.

4. Saudi Visa / Visit Invitation fields (extract when it is a Saudi visa/visit document, else ""):
   - visaDocumentNumber (Document / Visa / Application Number)
   - saudiSponsorId (Saudi Host/Sponsor Iqama ID, National ID, or Establishment number)
   - applicantNameAr (Applicant name in Arabic)
   - applicantNameEn (Applicant name in English)
   - documentPassportNumber (Passport number printed in the visa document, uppercase)
   - portOfEntry (Arrival port / Consulate / City e.g. Cairo, Alexandria)

5. Set validityStatus, summaryAr, missingRequirements, and confidenceNote.`
    : `أنت خبير تحليل جوازات السفر ومستندات التأشيرات والزيارات السعودية في شركة "مسارك للإنجاز السياحي".
تاريخ اليوم الحالي هو: ${todayIso}.
سياق المعاملة / الخدمة: ${visaType}.

قم بفحص الملف المرفق بدقة (صورة أو ملف PDF):
1. الوضوح وقابلية القراءة:
   - isReadable: true إذا كانت البيانات مقروءة، وإلا false.
   - clarityStatus: "clear" | "blurry" | "cropped" | "unclear".
   - clarityIssueAr / clarityIssueEn: فارغ "" إذا كان واضحاً، وإلا تنبيه واضح لإعادة التصوير/الرفع بوضوح.

2. التعرّف التلقائي على نوع الملف:
   - detectedDocumentKind: "passport" (جواز سفر) أو "saudi_visa" (مستند تأشيرة/زيارة سعودية/إنجاز) أو "other".
   - documentType: وصف نوع المستند بالعربية.

3. استخراج بيانات جواز السفر الكاملة (إن كان جواز سفر، وإلا ""):
   - passportFullNameEn و fullName: الاسم الكامل بالإنجليزية كما في الجواز.
   - passportFullNameAr: الاسم الكامل بالعربية إن وجد في الجواز (وإلا "").
   - passportNumber: رقم الجواز بأحرف كبيرة بدون مسافات.
   - nationality: الجنسية.
   - birthDate: تاريخ الميلاد بصيغة YYYY-MM-DD.
   - issueDate: تاريخ الإصدار بصيغة YYYY-MM-DD.
   - expiryDate: تاريخ الانتهاء بصيغة YYYY-MM-DD.
   تحقق من شرط صلاحية الـ 6 أشهر (180 يوماً) من ${todayIso}.

4. استخراج بيانات مستند التأشيرة / الزيارة السعودية (إن كان مستند تأشيرة أو زيارة، وإلا ""):
   - visaDocumentNumber: رقم المستند (رقم مستند التأشيرة أو طلب الزيارة).
   - saudiSponsorId: رقم الكفيل / رقم إقامة أو هوية المستضيف السعودي.
   - applicantNameAr: اسم صاحب الطلب بالعربية.
   - applicantNameEn: اسم صاحب الطلب بالإنجليزية.
   - documentPassportNumber: رقم الجواز المدوّن في المستند.
   - portOfEntry: جهة القدوم (مثل القاهرة / الإسكندرية / إلخ).

5. حدد validityStatus و summaryAr و missingRequirements و confidenceNote.`;

  const data = await postGeminiWithModelFallback<{
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }>(apiKey, {
    systemInstruction: {
      parts: [
        {
          text: isEn
            ? 'Return strictly valid JSON matching the schema. Convert all parsed dates to YYYY-MM-DD. Never guess unreadable numbers or dates.'
            : 'أرجع النتيجة بصيغة JSON مطابقة للمخطط فقط، وحوّل التواريخ إلى YYYY-MM-DD، ولا تخمّن أرقاماً أو تواريخ غير مقروءة.',
        },
      ],
    },
    contents: [
      {
        parts: [
          { inlineData: { mimeType: safeMimeType, data: cleanBase64 } },
          { text: promptText },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          detectedDocumentKind: { type: 'STRING' },
          documentType: { type: 'STRING' },
          fullName: { type: 'STRING' },
          passportFullNameEn: { type: 'STRING' },
          passportFullNameAr: { type: 'STRING' },
          passportNumber: { type: 'STRING' },
          nationality: { type: 'STRING' },
          birthDate: { type: 'STRING' },
          issueDate: { type: 'STRING' },
          expiryDate: { type: 'STRING' },
          visaDocumentNumber: { type: 'STRING' },
          saudiSponsorId: { type: 'STRING' },
          applicantNameAr: { type: 'STRING' },
          applicantNameEn: { type: 'STRING' },
          documentPassportNumber: { type: 'STRING' },
          portOfEntry: { type: 'STRING' },
          hasSixMonthsValidity: { type: 'BOOLEAN' },
          remainingDays: { type: 'INTEGER' },
          validityStatus: { type: 'STRING' },
          summaryAr: { type: 'STRING' },
          missingRequirements: { type: 'ARRAY', items: { type: 'STRING' } },
          confidenceNote: { type: 'STRING' },
          isReadable: { type: 'BOOLEAN' },
          clarityStatus: { type: 'STRING' },
          clarityIssueAr: { type: 'STRING' },
          clarityIssueEn: { type: 'STRING' },
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
          'applicantNameAr',
          'applicantNameEn',
          'documentPassportNumber',
          'portOfEntry',
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
  const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const parsed = JSON.parse(rawJsonText) as PassportAiCheckResult;
  return normalizePassportAiResult(parsed);
}

async function callGeminiDirectClarityCheck(
  apiKey: string,
  params: {
    imageBase64: string;
    mimeType: string;
    docCategory: string;
  }
): Promise<DocumentClarityCheckResult> {
  const cleanBase64 = params.imageBase64.includes(',')
    ? params.imageBase64.split(',')[1]
    : params.imageBase64;
  const isPersonalPhoto = params.docCategory === 'avatar' || params.docCategory === 'photo';

  const promptText = isPersonalPhoto
    ? `Inspect this uploaded personal portrait/ID photo for travel/visa submission:
Determine if the face is clearly visible and in focus (not severely blurred, cropped/cut-off, extremely dark, or unusable).
Return JSON: isClear (boolean), clarityStatus ("clear" | "blurry" | "cropped" | "unclear"), issueAr (concise Arabic warning if isClear is false else ""), issueEn (concise English warning if isClear is false else "").`
    : `Inspect this uploaded travel document (${params.docCategory}) image for clarity:
Determine if text, numbers, barcodes, or details are legible, or if the photo is severely blurry, cropped, glare-obscured, or illegible.
Return JSON: isClear (boolean), clarityStatus ("clear" | "blurry" | "cropped" | "unclear"), issueAr (concise Arabic warning if isClear is false else ""), issueEn (concise English warning if isClear is false else "").`;

  const data = await postGeminiWithModelFallback<{
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }>(apiKey, {
    systemInstruction: {
      parts: [
        {
          text: 'Return strictly valid JSON evaluating image clarity accurately without false alarms on decent phone scans.',
        },
      ],
    },
    contents: [
      {
        parts: [
          { inlineData: { mimeType: params.mimeType || 'image/jpeg', data: cleanBase64 } },
          { text: promptText },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          isClear: { type: 'BOOLEAN' },
          clarityStatus: { type: 'STRING' },
          issueAr: { type: 'STRING' },
          issueEn: { type: 'STRING' },
        },
        required: ['isClear', 'clarityStatus', 'issueAr', 'issueEn'],
      },
    },
  });
  const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const parsed = JSON.parse(rawJsonText) as DocumentClarityCheckResult;
  return {
    isClear: parsed.isClear !== false,
    clarityStatus:
      parsed.clarityStatus === 'blurry' ||
      parsed.clarityStatus === 'cropped' ||
      parsed.clarityStatus === 'unclear'
        ? parsed.clarityStatus
        : 'clear',
    issueAr: String(parsed.issueAr || '').trim(),
    issueEn: String(parsed.issueEn || '').trim(),
  };
}

/**
 * Unified Smart Passport & Document Reader (gemini-3.8-flash primary -> gemini-3.5-flash-lite fallback):
 * 1) Tries full-stack backend (/api/passport-check) which resolves Firestore site_config/general.geminiApiKey -> process.env.GEMINI_API_KEY.
 * 2) When running statically (GitHub Pages / Android WebView APK) or if backend is absent, falls back to direct Gemini REST call using the Firestore site_config/general.geminiApiKey.
 */
export async function analyzePassportWithGemini(params: {
  imageBase64: string;
  mimeType: string;
  visaType?: string;
  lang: 'ar' | 'en';
}): Promise<GeminiPassportCallResponse> {
  let serverErrorMessage = '';
  let backendUnavailable = false;

  try {
    const response = await fetch('/api/passport-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: params.imageBase64,
        mimeType: params.mimeType,
        visaType: params.visaType,
        lang: params.lang,
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (response.status === 404 || !contentType.includes('application/json')) {
      backendUnavailable = true;
    } else {
      const data = (await response.json()) as {
        result?: PassportAiCheckResult;
        noKeyConfigured?: boolean;
        error?: string;
      };
      if (response.ok && data.result) {
        return {
          ok: true,
          result: normalizePassportAiResult(data.result),
        };
      }
      if (data.noKeyConfigured) {
        backendUnavailable = true;
      } else {
        serverErrorMessage = data.error || '';
      }
    }
  } catch {
    backendUnavailable = true;
  }

  // Fallback for GitHub Pages / Android static builds (or server missing env key when Firestore has key)
  if (backendUnavailable) {
    const firestoreKey = await resolveFirestoreGeminiKey();
    if (!firestoreKey) {
      return {
        ok: false,
        noKeyConfigured: true,
        error:
          params.lang === 'en'
            ? 'Gemini API key is not configured yet in Admin Settings.'
            : 'مفتاح الذكاء الاصطناعي (Gemini API Key) غير مهيأ بعد في إعدادات لوحة الإدارة.',
      };
    }

    try {
      const directResult = await callGeminiDirectPassportScan(firestoreKey, params);
      return {
        ok: true,
        result: directResult,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Gemini scan failed',
      };
    }
  }

  return {
    ok: false,
    error: serverErrorMessage || 'Could not analyze passport right now.',
  };
}

/**
 * Inspects any uploaded document or personal photo for blur, cropping, glare, or illegibility using gemini-3.8-flash (with gemini-3.5-flash-lite fallback).
 */
export async function checkDocumentClarityWithGemini(params: {
  imageBase64: string;
  mimeType: string;
  docCategory: string;
  lang: 'ar' | 'en';
}): Promise<GeminiClarityCallResponse> {
  if (!params.mimeType?.startsWith('image/')) {
    return {
      ok: true,
      result: { isClear: true, clarityStatus: 'clear', issueAr: '', issueEn: '' },
    };
  }

  let backendUnavailable = false;
  try {
    const response = await fetch('/api/document-clarity-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: params.imageBase64,
        mimeType: params.mimeType,
        docCategory: params.docCategory,
        lang: params.lang,
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (response.status === 404 || !contentType.includes('application/json')) {
      backendUnavailable = true;
    } else {
      const data = (await response.json()) as {
        result?: DocumentClarityCheckResult;
        noKeyConfigured?: boolean;
        error?: string;
      };
      if (response.ok && data.result) {
        return { ok: true, result: data.result };
      }
      if (data.noKeyConfigured) {
        backendUnavailable = true;
      }
    }
  } catch {
    backendUnavailable = true;
  }

  if (backendUnavailable) {
    const firestoreKey = await resolveFirestoreGeminiKey();
    if (!firestoreKey) {
      return { ok: false, noKeyConfigured: true };
    }
    try {
      const result = await callGeminiDirectClarityCheck(firestoreKey, {
        imageBase64: params.imageBase64,
        mimeType: params.mimeType,
        docCategory: params.docCategory,
      });
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Clarity check failed' };
    }
  }

  return { ok: false, error: 'Clarity check failed' };
}
