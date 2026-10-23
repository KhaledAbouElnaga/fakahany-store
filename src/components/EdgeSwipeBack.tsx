import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { scopedStoreHref } from '../lib/storeLinks';

/** Let native system gestures win; provide edge-back where touch events reach us. */
export default function EdgeSwipeBack(){
  const location=useLocation();
  const navigate=useNavigate();
  useEffect(()=>{
    let start:{x:number;y:number;time:number;side:'left'|'right';claimed:boolean;dismiss:HTMLButtonElement|null}|null=null;
    const home=scopedStoreHref('/',window.location);
    const canNavigate=Number(window.history.state?.idx)>0||location.pathname+location.search!==home;
    const onStart=(event:TouchEvent)=>{
      start=null;
      if(event.touches.length!==1)return;
      const target=event.target instanceof Element?event.target:null;
      // Carousels, form controls and horizontal scrollers keep their own gestures.
      if(target?.closest('input,textarea,select,[contenteditable="true"],.product-gallery,[data-no-edge-back]'))return;
      const modal=document.querySelector('.modal-backdrop');
      const dismiss=modal?.querySelector<HTMLButtonElement>('[data-edge-back-dismiss]')||null;
      if(modal&&!dismiss)return; // Never dismiss an unsaved editor implicitly.
      if(!dismiss&&!canNavigate)return;
      const {clientX:x,clientY:y}=event.touches[0];
      if(x>24&&x<window.innerWidth-24)return;
      start={x,y,time:Date.now(),side:x<=24?'left':'right',claimed:false,dismiss};
    };
    const onMove=(event:TouchEvent)=>{
      if(!start)return;
      if(event.touches.length!==1){start=null;return;}
      const touch=event.touches[0];
      const dx=touch.clientX-start.x,dy=touch.clientY-start.y;
      const inward=start.side==='left'?dx:-dx;
      if(Math.abs(dy)>20&&Math.abs(dy)>Math.abs(dx)){start=null;return;}
      if(inward>14&&inward>Math.abs(dy)*1.5){
        // Non-cancelable events may belong to the browser's native history swipe.
        if(!event.cancelable){start=null;return;}
        event.preventDefault();start.claimed=true;
      }
    };
    const onEnd=(event:TouchEvent)=>{
      const gesture=start;start=null;
      if(!gesture||!gesture.claimed||event.touches.length||!event.changedTouches.length)return;
      const touch=event.changedTouches[0];
      const dx=touch.clientX-gesture.x,dy=touch.clientY-gesture.y;
      const inward=gesture.side==='left'?dx:-dx;
      if(inward<80||inward<Math.abs(dy)*2||Date.now()-gesture.time>900)return;
      if(gesture.dismiss){gesture.dismiss.click();return;}
      if(Number(window.history.state?.idx)>0)navigate(-1);
      else navigate(home,{replace:true}); // A directly opened inner page still has a way home.
    };
    const cancel=()=>{start=null;};
    document.addEventListener('touchstart',onStart,{passive:true});
    document.addEventListener('touchmove',onMove,{passive:false});
    document.addEventListener('touchend',onEnd,{passive:true});
    document.addEventListener('touchcancel',cancel,{passive:true});
    return ()=>{
      document.removeEventListener('touchstart',onStart);
      document.removeEventListener('touchmove',onMove);
      document.removeEventListener('touchend',onEnd);
      document.removeEventListener('touchcancel',cancel);
    };
  },[location.pathname,location.search,location.key,navigate]);
  return null;
}
