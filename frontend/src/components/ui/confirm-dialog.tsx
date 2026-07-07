import React from 'react';
import { Modal } from './modal';
import { Button } from './button';
import { AlertCircle } from 'lucide-react';

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
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} className="max-w-md">
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 items-start">
          <div className={`p-2 rounded-full mt-0.5 ${type === 'danger' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
            <AlertCircle className="h-5 w-5" />
          </div>
          <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-50 pt-4 mt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button variant={type === 'danger' ? 'destructive' : 'primary'} size="sm" onClick={onConfirm} isLoading={isLoading}>
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
