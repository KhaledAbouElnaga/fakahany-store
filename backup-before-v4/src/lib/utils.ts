export const money = (value: number) => `${Number(value || 0).toLocaleString('ar-EG')} جنيه`;

export const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const normalizeWhatsAppNumber = (input: string) => {
  let digits = (input || '').replace(/\D/g, '');
  if (digits.startsWith('0020')) digits = digits.slice(2);
  if (digits.startsWith('01')) digits = `20${digits.slice(1)}`;
  return digits;
};

export const makeOrderNumber = () => {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
};

export const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export const arabicDayName = (date = new Date()) => ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][date.getDay()];

export function isStoreOpenNow(settings: { manual_open: boolean; working_days: string[]; opening_time: string; closing_time: string }, date = new Date()) {
  if (!settings.manual_open) return false;
  if (settings.working_days?.length && !settings.working_days.includes(arabicDayName(date))) return false;
  const toMinutes = (t: string) => { const [h,m] = (t || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const open = toMinutes(settings.opening_time);
  const close = toMinutes(settings.closing_time);
  const now = date.getHours() * 60 + date.getMinutes();
  if (open === close) return true;
  return open < close ? now >= open && now < close : now >= open || now < close;
}
