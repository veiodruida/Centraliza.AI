import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, Info } from 'lucide-react';

interface HelpTooltipProps {
  text: string;
}

export default function HelpTooltip({ text }: HelpTooltipProps) {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (show && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX + (rect.width / 2)
      });
    }
  }, [show]);

  return (
    <div className="relative inline-block ml-2 group" ref={iconRef}>
      <Info 
        size={16} 
        className="text-[var(--text-muted)] hover:text-blue-400 cursor-help transition-all hover:scale-110"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      
      {show && createPortal(
        <div 
          className="fixed w-64 p-5 bg-[var(--bg-surface)]/95 backdrop-blur-2xl border border-[var(--border)] rounded-[1.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[99999] animate-in fade-in zoom-in-95 duration-300 pointer-events-none"
          style={{
            top: coords.top - 16,
            left: coords.left,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="flex gap-3 items-start">
             <HelpCircle size={14} className="text-blue-500 mt-0.5 shrink-0" />
             <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-bold">
               {text}
             </p>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-[var(--bg-surface)]/95"></div>
        </div>,
        document.body
      )}
    </div>
  );
}
