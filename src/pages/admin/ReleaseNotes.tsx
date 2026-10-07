import { APP_VERSION, RELEASE_NOTES } from '../../lib/releaseNotes';

export default function ReleaseNotes(){
  return <><div className="page-title"><h1>ما الجديد</h1><span className="version-pill">الإصدار {APP_VERSION}</span></div><div className="release-list">{RELEASE_NOTES.map(r=><section className="panel" key={r.version}><div className="release-head"><b>الإصدار {r.version}</b><small>{r.date}</small></div><ul>{r.items.map(x=><li key={x}>{x}</li>)}</ul></section>)}</div></>;
}
