import { useEffect, useRef, type RefObject } from "react";

const modals: HTMLElement[] = [];
let originalOverflow = "";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
export function useModalA11y(containerRef:RefObject<HTMLElement|null>,onClose:()=>void){
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(()=>{
    const container=containerRef.current;
    if(!container)return;
    const previouslyFocused=document.activeElement as HTMLElement|null;
    const focusables=()=>Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el=>el.getClientRects().length>0);
    container.tabIndex = -1;
    (focusables()[0]??container).focus();
    if (!modals.length) originalOverflow = document.body.style.overflow;
    modals.push(container);
    document.body.style.overflow="hidden";
    function onKeyDown(e:KeyboardEvent){
      // Popups can stack (a profile over a chat): only the topmost one reacts.
      if(modals[modals.length-1]!==container)return;
      if(e.key==="Escape"){e.preventDefault();e.stopPropagation();closeRef.current();return;}
      if(e.key==="Tab"){
        const items=focusables();
        if(items.length===0){e.preventDefault();container.focus();return;}
        const first=items[0],last=items[items.length-1];
        if(e.shiftKey&&(document.activeElement===first||!container.contains(document.activeElement))){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&(document.activeElement===last||!container.contains(document.activeElement))){e.preventDefault();first.focus();}
      }
    }
    document.addEventListener("keydown",onKeyDown);
    return()=>{
      document.removeEventListener("keydown",onKeyDown);
      const wasTop = modals[modals.length-1] === container;
      modals.splice(modals.indexOf(container),1);
      if (!modals.length) document.body.style.overflow=originalOverflow;
      if(wasTop && previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  },[containerRef]);
}
export function overlayClick(onClose:()=>void){return(e:{target:EventTarget|null;currentTarget:EventTarget|null})=>{if(e.target===e.currentTarget)onClose();};}
