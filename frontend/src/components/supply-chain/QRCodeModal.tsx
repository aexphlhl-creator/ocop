import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { Download, Copy, ExternalLink, Check } from 'lucide-react';
import { toast } from 'sonner';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchId: string;
  batchNumber?: string;
  productName?: string;
}

export function QRCodeModal({ isOpen, onClose, batchId, batchNumber, productName }: QRCodeModalProps) {
  const [copied, setCopied] = React.useState(false);
  
  // URL to public traceability page
  const trackingUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/traceability/${batchId}` 
    : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(trackingUrl);
    setCopied(true);
    toast.success('Đã sao chép đường dẫn Tracking');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const svg = document.getElementById('batch-qrcode');
    if (!svg) return;
    
    // Convert SVG to PNG
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Add padding
      const padding = 20;
      canvas.width = img.width + padding * 2;
      canvas.height = img.height + padding * 2;
      
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, padding, padding);
        
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `QR_${batchNumber || 'Batch'}.png`;
        downloadLink.href = `${pngFile}`;
        downloadLink.click();
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mã QR Truy Xuất Nguồn Gốc">
      <div className="flex flex-col items-center p-4">
        <div className="text-center mb-6">
          <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{productName || 'Sản phẩm'}</h3>
          <p className="text-sm text-slate-500 font-mono mt-1">Lô: {batchNumber || batchId}</p>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-6 relative group">
          <QRCodeSVG 
            id="batch-qrcode"
            value={trackingUrl} 
            size={220} 
            level="H"
            includeMargin={false}
          />
        </div>

        <div className="w-full space-y-3">
          <div className="flex gap-2 w-full">
            <Button onClick={handleCopy} variant="outline" className="flex-1 gap-2">
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Đã sao chép' : 'Copy Link'}
            </Button>
            <Button onClick={handleDownload} className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Download className="w-4 h-4" />
              Tải PNG
            </Button>
          </div>
          <Button 
            variant="ghost" 
            className="w-full gap-2 text-slate-500" 
            onClick={() => window.open(trackingUrl, '_blank')}
          >
            <ExternalLink className="w-4 h-4" /> Mở trang Tracking
          </Button>
        </div>
      </div>
    </Modal>
  );
}
