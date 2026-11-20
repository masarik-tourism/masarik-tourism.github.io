import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '15mb' }));

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.post('/api/passport-check', async (req, res) => {
  try {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(500).json({
        error:
          'مفتاح Gemini API غير مهيأ على الخادم. يرجى التحقق من Settings > Secrets لإضافة GEMINI_API_KEY.',
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
    const mimeType = (body.mimeType || 'image/jpeg').trim();
    const visaType = (
      body.visaType || (isEn ? 'Saudi Visa / Tasheer' : 'تأشيرة السعودية / تساهيل')
    ).trim();

    if (!rawBase64) {
      res.status(400).json({
        error: isEn
          ? 'Please attach a photo of the passport or document first.'
          : 'يرجى إرفاق صورة الجواز أو المستند أولاً.',
      });
      return;
    }

    const cleanBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
    const todayIso = new Date().toISOString().slice(0, 10);

    const promptText = isEn
      ? `You are a passport and visa document verification specialist at "Masarik Tourism LLC" (مسارك للإنجاز السياحي).
Today's date is: ${todayIso}.
Requested visa/service type: ${visaType}.

Inspect the attached image carefully and extract:
1. documentType (e.g., Passport, Visa, Work Contract, Certificate).
2. fullName as shown on the document (or MRZ line if present).
3. passportNumber (if visible).
4. nationality.
5. birthDate (YYYY-MM-DD if clearly legible, otherwise empty string).
6. expiryDate (YYYY-MM-DD if clearly legible, otherwise empty string).
7. Calculate remainingDays from today (${todayIso}) to expiryDate, and check the mandatory 6-month (180+ days) validity rule.
8. Set validityStatus:
   - "valid_6m" if remainingDays >= 180.
   - "warning_under_6m" if still valid (> 0 days) but under 180 days.
   - "expired" if expired.
   - "unclear" if expiry date is unreadable or image is unclear/not a passport.
9. Write a clear, professional English summary in summaryAr (yes, keep JSON key name summaryAr for schema compatibility) and list required/missing documents in missingRequirements for (${visaType}) such as white-background photos, bank statement, VFS Tasheer appointment, Enjaz fee & medical insurance, Chamber of Commerce/MOFA attestation, or passport renewal if under 6 months.`
      : `أنت خبير فحص جوازات السفر ومستندات التأشيرات في شركة "مسارك للإنجاز السياحي".
تاريخ اليوم الحالي هو: ${todayIso}.
نوع المعاملة / التأشيرة المطلوبة من العميل: ${visaType}.

قم بفحص الصورة المرفقة بدقة واستخرج البيانات التالية:
1. نوع المستند (جواز سفر، تأشيرة، عقد عمل، شهادة، إلخ).
2. الاسم الكامل كما يظهر في المستند (أو سطر MRZ إن وجد).
3. رقم الجواز (إن وجد).
4. الجنسية.
5. تاريخ الميلاد (بصيغة YYYY-MM-DD إن كان ظاهراً بوضوح، وإلا نص فارغ).
6. تاريخ انتهاء صلاحية الجواز (بصيغة YYYY-MM-DD إن كان ظاهراً بوضوح، وإلا نص فارغ).
7. احسب عدد الأيام المتبقية من تاريخ اليوم (${todayIso}) حتى تاريخ الانتهاء، وتحقق من قاعدة الصلاحية الإلزامية (6 أشهر = 180 يوماً على الأقل).
8. حدد حالة الصلاحية:
   - "valid_6m" إذا كانت الصلاحية 180 يوماً فأكثر.
   - "warning_under_6m" إذا كان سارياً ولكن أقل من 180 يوماً.
   - "expired" إذا كان منتهياً.
   - "unclear" إذا لم يكن تاريخ الانتهاء واضحاً أو كانت الصورة غير واضحة أو ليست جواز سفر.
9. اكتب ملخصاً عربياً واضحاً ومهنياً لحالة المستند، واذكر قائمة بالمتطلبات الناقصة أو اللازمة لنوع المعاملة (${visaType}) مثل: صور شخصية بخلفية بيضاء، كشف حساب بنكي، حجز موعد تساهيل VFS، سداد منصة إنجاز والتأمين الطبي، تصديق الغرفة التجارية/الخارجية، أو تجديد الجواز إذا كانت الصلاحية أقل من 6 أشهر.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
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
          ? 'Return strictly valid JSON matching the schema in clear professional English. Never guess unreadable numbers.'
          : 'أرجع النتيجة بصيغة JSON مطابقة للمخطط فقط وباللغة العربية الفصحى الواضحة للعميل المصري/العربي، ولا تخمّن أرقاماً غير مقروءة.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            documentType: { type: Type.STRING },
            fullName: { type: Type.STRING },
            passportNumber: { type: Type.STRING },
            nationality: { type: Type.STRING },
            birthDate: { type: Type.STRING },
            expiryDate: { type: Type.STRING },
            hasSixMonthsValidity: { type: Type.BOOLEAN },
            remainingDays: { type: Type.INTEGER },
            validityStatus: { type: Type.STRING },
            summaryAr: { type: Type.STRING },
            missingRequirements: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            confidenceNote: { type: Type.STRING },
          },
          required: [
            'documentType',
            'fullName',
            'passportNumber',
            'nationality',
            'birthDate',
            'expiryDate',
            'hasSixMonthsValidity',
            'remainingDays',
            'validityStatus',
            'summaryAr',
            'missingRequirements',
            'confidenceNote',
          ],
        },
      },
    });

    const rawText = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawText);
    res.json({ result: parsed });
  } catch (err: unknown) {
    const errorObj = err as { status?: number; message?: string };
    const status = typeof errorObj?.status === 'number' ? errorObj.status : 500;
    const message =
      errorObj?.message || 'حدث خطأ أثناء فحص المستند عبر خدمة الذكاء الاصطناعي.';
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
  }
});

let cachedGoogleAccessToken: { token: string; expiresAtMs: number; projectId: string } | null = null;

async function getFcmOAuthToken(serviceAccountJson: string): Promise<{
  token: string;
  projectId: string;
} | null> {
  try {
    const sa = JSON.parse(serviceAccountJson) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
      token_uri?: string;
    };
    if (!sa.project_id || !sa.client_email || !sa.private_key) return null;

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

    const saJson = (process.env.FCM_SERVICE_ACCOUNT_JSON || '').trim();
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
                  webpush: {
                    notification: {
                      icon: '/pwa-192x192.png',
                      badge: '/pwa-192x192.png',
                      dir: 'rtl',
                      lang: 'ar',
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
