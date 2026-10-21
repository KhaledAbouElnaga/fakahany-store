// Explicit paths take precedence over legacy query links. Never remember a
// tenant in sessionStorage: opening the legacy root must keep its own meaning.
export function pathStoreSlug(pathname:string){
  const match=pathname.match(/^\/s\/([^/]+)(?:\/|$)/);
  if(!match)return '';
  try{return decodeURIComponent(match[1]).trim().toLowerCase()}catch{return '!invalid'}
}

export function requestedStoreSlug(location:Pick<Location,'pathname'|'search'>){
  return pathStoreSlug(location.pathname)||(new URLSearchParams(location.search).get('store')||'').trim().toLowerCase();
}

export function storePath(slug:string,path='/'){
  return '/s/'+encodeURIComponent(slug)+(path==='/'?'':path.startsWith('/')?path:'/'+path);
}

export function scopedStoreHref(path:string,location:Pick<Location,'pathname'|'search'>){
  const slug=requestedStoreSlug(location);
  if(!slug)return path;
  if(pathStoreSlug(location.pathname))return path.startsWith('/s/')?path:storePath(slug,path);
  const url=new URL(path,'https://local.invalid');
  url.searchParams.set('store',slug);
  return url.pathname+url.search+url.hash;
}

export function storeStorageKey(key:string){
  const slug=requestedStoreSlug(window.location);
  // Retain existing root browser data; explicit stores get separate buckets.
  return slug?key+':store:'+encodeURIComponent(slug):key;
}
