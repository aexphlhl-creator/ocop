import React from 'react';
import { Modal } from './modal';
import { Button } from './button';
import { AlertTriangle, Info } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'danger';
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  type = 'info',
  isLoading = false,
}) => {
  const Icon = type === 'danger' ? AlertTriangle : Info;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} className="max-w-md">
      <div className="flex flex-col gap-5">
        <div className="flex gap-3.5 items-start">
          <div
            className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
              type === 'danger'
                ? 'bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400'
                : 'bg-blue-50 text-blue-500 dark:bg-blue-950/30 dark:text-blue-400'
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{description}</p>
        </div>

        <div className="flex justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800 pt-4">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button
            variant={type === 'danger' ? 'destructive' : 'primary'}
            size="sm"
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
