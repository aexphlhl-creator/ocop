import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../utils/cn';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300" onClick={onClose} />

      {/* Modal Content */}
      <div
        className={cn(
          'relative w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden transform transition-all duration-300 scale-100 animate-in fade-in zoom-in-95',
          className
        )}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <Button variant="ghost" size="sm" className="w-8 h-8 p-0 text-slate-400 hover:text-slate-600 rounded-full" onClick={onClose}>
            <X className="h-4.5 w-4.5" />
          </Button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 text-sm text-slate-600 leading-relaxed">{children}</div>
      </div>
    </div>
  );
};
