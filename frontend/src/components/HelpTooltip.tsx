import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

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
      <HelpCircle 
        size={14} 
        className="text-slate-500 hover:text-blue-400 cursor-help transition-colors"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      
      {show && createPortal(
        <div 
          className="absolute w-64 p-4 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-[99999] animate-in fade-in zoom-in duration-200 pointer-events-none"
          style={{
            top: coords.top - 12,
            left: coords.left,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
            {text}
          </p>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900/95"></div>
        </div>,
        document.body
      )}
    </div>
  );
}
