import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/_middleware.js';
class Rewriter {on(){return this} transform(response){return response}}
globalThis.HTMLRewriter=Rewriter;
const response=()=>new Response('<html></html>',{headers:{'content-type':'text/html'}});
const context=url=>({request:new Request(url,{headers:{'user-agent':'WhatsApp'}}),env:{VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_ANON_KEY:'public-test-key'},next:async()=>response()});

test('platform pages do not fetch or expose any merchant settings',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('Must not fetch merchant data')};
 try{assert.equal((await onRequest(context('https://matgark.pages.dev/'))).status,200);assert.equal((await onRequest(context('https://fakahany-store.pages.dev/platform'))).status,200)}finally{globalThis.fetch=original}
});
test('store share metadata is selected with the resolved store id',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return calls.length===1?Response.json({id:'store-b',slug:'home'}):Response.json([{store_name:'Store B'}])};
 try{
  await onRequest(context('https://matgark.pages.dev/s/home'));
  assert.equal(JSON.parse(calls[0].options.body).slug_input,'home');
  assert.match(calls[1].url,/store_id=eq.store-b&select=/);
 }finally{globalThis.fetch=original}
});
test('unknown slug never shares a fallback merchant name',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({id:'default',slug:'demo-market'})};
 try{await onRequest(context('https://matgark.pages.dev/s/missing'));assert.equal(calls,1)}finally{globalThis.fetch=original}
});

