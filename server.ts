import express from 'express';
import path from 'node:path';
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
