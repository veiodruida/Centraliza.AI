import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface HelpTooltipProps {
  text: string;
}

export default function HelpTooltip({ text }: HelpTooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block ml-2 group">
      <HelpCircle 
        size={14} 
        className="text-slate-500 hover:text-blue-400 cursor-help transition-colors"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-64 p-4 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-[100] animate-in fade-in zoom-in duration-200">
          <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
            {text}
          </p>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900/90"></div>
        </div>
      )}
    </div>
  );
}
