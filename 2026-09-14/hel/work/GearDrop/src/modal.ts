import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
export function useModalA11y(containerRef:RefObject<HTMLElement|null>,onClose:()=>void){
  useEffect(()=>{
    const container=containerRef.current;
    if(!container)return;
    const previouslyFocused=document.activeElement as HTMLElement|null;
    const focusables=()=>Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
    (focusables()[0]??container).focus();
    const prevOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    function onKeyDown(e:KeyboardEvent){
      if(e.key==="Escape"){e.stopPropagation();onClose();return;}
      if(e.key==="Tab"){
        const items=focusables();
        if(items.length===0)return;
        const first=items[0],last=items[items.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    }
    document.addEventListener("keydown",onKeyDown);
    return()=>{
      document.removeEventListener("keydown",onKeyDown);
      document.body.style.overflow=prevOverflow;
      previouslyFocused?.focus?.();
    };
  },[containerRef,onClose]);
}
export function overlayClick(onClose:()=>void){return(e:{target:EventTarget|null;currentTarget:EventTarget|null})=>{if(e.target===e.currentTarget)onClose();};}
