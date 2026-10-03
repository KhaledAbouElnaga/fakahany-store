# تحديث متجر الفكهاني النهائي

هذا التحديث لا يحذف المنتجات أو الطلبات أو حساب المدير أو ملف الاتصال `.env`.

## الترتيب الصحيح

1. أغلق نافذة `START-STORE.bat` السوداء.
2. افتح Supabase > SQL Editor > New query.
3. افتح ملف `MIGRATION-FINAL.sql` الموجود مع هذا التحديث، وانسخ كل محتواه وشغله مرة واحدة. يجب أن تظهر نتيجة `FINAL MIGRATION SUCCESS`.
4. فك ضغط هذا التحديث، ثم انسخ `APPLY-FINAL-UPDATE.bat` و`MIGRATION-FINAL.sql` ومجلد `patch` إلى داخل مجلد مشروع `fakahany-store` الأصلي، بجوار `START-STORE.bat`.
5. شغل `APPLY-FINAL-UPDATE.bat`.
6. بعد نجاحه، شغل `START-STORE.bat`.
7. افتح المتجر ولوحة الإدارة واختبرهما.

سيتم إنشاء مجلد `FINAL-BACKUP` تلقائيًا قبل استبدال ملفات الكود.
