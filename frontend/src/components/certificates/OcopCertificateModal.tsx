'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Printer, X } from 'lucide-react';

export interface OcopCertificateData {
  certificateNumber?: string;
  productName: string;
  ocopLevel?: number;
  ownerName?: string;
  issuingOrganization?: string;
  status?: string;
  taxCode?: string;
  address?: string;
  wardName?: string;
  provinceName?: string;
  issueDate?: string;
  expiryDate?: string;
  decisionNumber?: string;
  qrUrl?: string;
  documentHash?: string;
  blockchainTxHash?: string;
  categoryName?: string;
}

interface OcopCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: OcopCertificateData;
}

function dateLabel(value?: string) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Chưa có dữ liệu';
  return new Date(value).toLocaleDateString('vi-VN');
}

export function OcopCertificateModal({ isOpen, onClose, data }: OcopCertificateModalProps) {
  if (!isOpen) return null;
  const rows = [
    ['Số chứng nhận', data.certificateNumber],
    ['Chủ thể sản xuất', data.ownerName],
    ['Đơn vị cấp', data.issuingOrganization],
    ['Trạng thái hồ sơ', data.status],
    ['Xếp hạng OCOP', data.ocopLevel ? data.ocopLevel + ' sao' : undefined],
    ['Số quyết định', data.decisionNumber],
    ['Ngày cấp', dateLabel(data.issueDate)],
    ['Ngày hết hạn', dateLabel(data.expiryDate)],
    ['Mã số thuế', data.taxCode],
    ['Địa chỉ', data.address || [data.wardName, data.provinceName].filter(Boolean).join(', ')],
  ];
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="certificate-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
      <style jsx global>{`
        @media print {
          body { visibility: hidden !important; }
          #ocop-cert-print-container, #ocop-cert-print-container * { visibility: visible !important; }
          #ocop-cert-print-container { position: absolute; inset: 0; width: 100%; padding: 16mm; background: white; }
          .certificate-toolbar { display: none !important; }
        }
      `}</style>
      <div className="w-full max-w-3xl max-h-[95vh] overflow-auto rounded-2xl bg-white text-slate-900 shadow-xl">
        <div className="certificate-toolbar flex justify-between items-center border-b p-4">
          <span className="font-semibold">Tra cứu hồ sơ chứng nhận</span>
          <div className="flex gap-3">
            <button type="button" onClick={() => window.print()} className="flex items-center gap-2 text-emerald-700"><Printer size={18} /> In thông tin</button>
            <button type="button" onClick={onClose} aria-label="Đóng"><X size={22} /></button>
          </div>
        </div>
        <section id="ocop-cert-print-container" className="p-6 sm:p-8 space-y-6">
          <h2 id="certificate-title" className="text-2xl font-bold">Thông tin hồ sơ: {data.productName}</h2>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Bản tra cứu từ dữ liệu hệ thống, không thay thế chứng nhận gốc. Không xác nhận chữ ký số hoặc con dấu của đơn vị cấp. Vui lòng đối chiếu tệp chứng nhận gốc để kiểm tra hiệu lực.</p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {rows.map(([label, value]) => <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd className="font-medium break-words">{value || 'Chưa có dữ liệu'}</dd></div>)}
          </dl>
          {data.documentHash && <p className="text-xs break-all"><strong>Mã băm tài liệu:</strong> {data.documentHash}</p>}
          {data.blockchainTxHash && <p className="text-xs break-all"><strong>Mã giao dịch được lưu trong hệ thống:</strong> {data.blockchainTxHash}</p>}
          {data.qrUrl && <div className="flex items-center gap-4 border-t pt-4"><QRCodeSVG value={data.qrUrl} size={88} /><p className="text-xs break-all">Đường dẫn tra cứu:<br />{data.qrUrl}</p></div>}
        </section>
      </div>
    </div>
  );
}
