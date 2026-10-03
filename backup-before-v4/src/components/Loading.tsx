export default function Loading({ text = 'جاري التحميل...' }: { text?: string }) {
  return <div className="center-state"><div className="spinner"/><p>{text}</p></div>;
}
