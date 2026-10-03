# متجر الفكهاني

متجر عربي لبيع الفواكه والخضروات مع سلة، طلب عبر واتساب، لوحة إدارة، مخزون اختياري، مناطق توصيل اختيارية، وسجل طلبات.

## التشغيل على الكمبيوتر

1. ثبّت Node.js LTS.
2. أنشئ ملف `.env` من `.env.example`.
3. ضع قيم Supabase:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. شغّل `START-STORE.bat`.

المتجر:
`http://localhost:5173`

لوحة الإدارة:
`http://localhost:5173/admin`

## إعداد قاعدة بيانات جديدة

في Supabase SQL Editor شغّل الملفات بهذا الترتيب:

1. `supabase/schema.sql`
2. `supabase/migrations/20261002_final_features.sql`
3. `supabase/migrations/20261003_hardening.sql`

لا تضع مفاتيح Supabase الحقيقية داخل GitHub. ملف `.env` مستبعد من Git.

## فحص النسخة قبل النشر

المشروع يحتوي على GitHub Actions تقوم تلقائيًا بـ:

- تثبيت الحزم.
- فحص TypeScript.
- بناء نسخة الإنتاج.

ويمكن الفحص محليًا عبر:

```bash
npm ci
npm run typecheck
npm run build
```

## النشر

المشروع تطبيق Vite ثابت، ومجلد الإنتاج هو:

`dist`

يمكن نشره على Cloudflare Pages بإعدادات:

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

ملف `public/_redirects` موجود حتى تعمل روابط مثل `/admin` مباشرة بعد النشر.

## ملاحظات أمان

- الدفع الإلكتروني غير مستخدم.
- أسعار وإجماليات الطلب يتم التحقق منها داخل Supabase قبل حفظ الطلب.
- صلاحيات الإدارة محمية بواسطة Supabase Auth وRLS.
- لا تستخدم Service Role Key داخل الواجهة الأمامية.
