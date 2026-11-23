'use client';

import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Printer,
  X,
  Truck,
  Package,
  MapPin,
  Calendar,
  Building2,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { ShipmentRecord } from './types';
import { routeLabels, statusLabels } from './shipment-workflow';

interface ShipmentWaybillModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipment: ShipmentRecord;
}

export function ShipmentWaybillModal({
  isOpen,
  onClose,
  shipment,
}: ShipmentWaybillModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const createdDateStr = shipment.createdAt
    ? new Date(shipment.createdAt).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date().toLocaleDateString('vi-VN');

  const totalQuantity = shipment.items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0
  );

  const qrTrackingUrl =
    shipment.trackingCode
      ? `http://localhost:3000/traceability/tracking/${shipment.trackingCode}`
      : `http://localhost:3000/dashboard/shipments`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto font-sans">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          body {
            visibility: hidden !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #shipment-waybill-print-container,
          #shipment-waybill-print-container * {
            visibility: visible !important;
          }
          #shipment-waybill-print-container {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            z-index: 999999 !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[96vh]">
        {/* Top Action Bar (Hidden during Print) */}
        <div className="no-print flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-100 text-blue-800">
              <Truck className="w-5 h-5" />
            </span>
            <div>
              <h2 className="font-bold text-slate-900 text-sm sm:text-base">
                Phiếu xuất kho kiêm Vận đơn giao hàng
              </h2>
              <p className="text-xs text-slate-500">
                Khổ A4 Portrait tiêu chuẩn Logistics & Chuỗi cung ứng OCOP
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-600/20 transition-all active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>In Phiếu / Xuất PDF</span>
            </button>

            <button
              onClick={onClose}
              type="button"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Area (A4 Portrait) */}
        <div className="overflow-auto p-4 sm:p-8 bg-slate-100 flex justify-center">
          <div
            id="shipment-waybill-print-container"
            ref={printRef}
            className="w-full max-w-[800px] bg-white text-slate-900 p-8 sm:p-10 shadow-lg rounded-xl border border-slate-200 flex flex-col justify-between"
          >
            <div>
              {/* Header Company & Form Number */}
              <div className="grid grid-cols-2 gap-4 pb-4 border-b-2 border-slate-800 items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black px-2 py-0.5 rounded bg-emerald-700 text-white tracking-widest">
                      OCOP VIỆT NAM
                    </span>
                    <span className="text-xs font-bold text-slate-700">
                      HỆ THỐNG CHUỖI CUNG ỨNG
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-900 mt-1.5 uppercase">
                    KHO XUẤT: {shipment.originWarehouse.name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Địa chỉ kho: Hệ thống phân phối Nông sản OCOP Quốc gia
                  </p>
                </div>

                <div className="text-right text-[11px] text-slate-600 space-y-0.5">
                  <p className="font-bold text-slate-900">Mẫu số: 02 - VT</p>
                  <p className="text-[10px] text-slate-500">
                    (Ban hành theo TT số 200/2014/TT-BTC)
                  </p>
                  <p className="font-semibold text-slate-800">
                    Số phiếu:{' '}
                    <span className="font-bold text-emerald-800">
                      {shipment.shipmentNumber}
                    </span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Ngày lập: {createdDateStr}
                  </p>
                </div>
              </div>

              {/* Title Header */}
              <div className="text-center my-6">
                <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-slate-900">
                  PHIẾU XUẤT KHO KIÊM VẬN ĐƠN GIAO HÀNG
                </h1>
                <p className="text-xs text-slate-500 italic mt-0.5">
                  (Dành cho hàng hóa nông sản OCOP chứng nhận nguồn gốc xuất xứ)
                </p>
              </div>

              {/* Logistics & Address Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs mb-6">
                <div className="space-y-1.5">
                  <p className="font-bold text-slate-900 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-emerald-800">
                    <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                    Đơn vị xuất kho
                  </p>
                  <p className="text-slate-700">
                    <strong>Kho gửi:</strong> {shipment.originWarehouse.name}
                  </p>
                  <p className="text-slate-700">
                    <strong>Tuyến vận chuyển:</strong>{' '}
                    {routeLabels[shipment.routeType] || shipment.routeType}
                  </p>
                  <p className="text-slate-700">
                    <strong>Trạng thái:</strong>{' '}
                    <span className="font-bold text-emerald-700">
                      {statusLabels[shipment.status] || shipment.status}
                    </span>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="font-bold text-slate-900 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-blue-800">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    Đơn vị / Người nhận hàng
                  </p>
                  <p className="text-slate-700">
                    <strong>Người nhận:</strong> {shipment.destinationName}
                  </p>
                  <p className="text-slate-700">
                    <strong>Địa chỉ giao:</strong> {shipment.destinationAddress}
                  </p>
                  <p className="text-slate-700">
                    <strong>Hãng vận chuyển:</strong>{' '}
                    {shipment.carrierOrganization.name}
                  </p>
                </div>
              </div>

              {/* Barcode & Tracking summary */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-white border border-slate-200 rounded-xl mb-6">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Mã vận đơn (Carrier Tracking Code)
                  </p>
                  <p className="text-base font-black text-slate-900 tracking-wider">
                    {shipment.trackingCode || 'CHƯA CÓ MÃ VẬN ĐƠN'}
                  </p>
                </div>

                {/* Simulated Barcode pattern */}
                <div className="flex flex-col items-center">
                  <div className="h-8 flex items-center gap-[2px] px-2 py-1 bg-slate-50 border border-slate-200 rounded">
                    <span className="w-1 h-6 bg-slate-900" />
                    <span className="w-0.5 h-6 bg-slate-900" />
                    <span className="w-1.5 h-6 bg-slate-900" />
                    <span className="w-0.5 h-6 bg-slate-900" />
                    <span className="w-2 h-6 bg-slate-900" />
                    <span className="w-0.5 h-6 bg-slate-900" />
                    <span className="w-1 h-6 bg-slate-900" />
                    <span className="w-1.5 h-6 bg-slate-900" />
                    <span className="w-0.5 h-6 bg-slate-900" />
                    <span className="w-1 h-6 bg-slate-900" />
                    <span className="w-2 h-6 bg-slate-900" />
                    <span className="w-0.5 h-6 bg-slate-900" />
                  </div>
                  <span className="text-[9px] text-slate-500 font-sans tracking-widest mt-0.5">
                    *{shipment.shipmentNumber}*
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="mb-6 overflow-hidden rounded-xl border border-slate-300">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 text-[11px] font-bold uppercase">
                      <th className="py-2.5 px-3 text-center border-r border-slate-300 w-12">
                        STT
                      </th>
                      <th className="py-2.5 px-3 border-r border-slate-300">
                        Mã Lô hàng (Batch)
                      </th>
                      <th className="py-2.5 px-3 border-r border-slate-300">
                        Tên sản phẩm OCOP
                      </th>
                      <th className="py-2.5 px-3 text-center border-r border-slate-300 w-24">
                        ĐVT
                      </th>
                      <th className="py-2.5 px-3 text-right border-r border-slate-300 w-28">
                        Số lượng xuất
                      </th>
                      <th className="py-2.5 px-3 text-center w-28">
                        Tiêu chuẩn
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipment.items.map((item, index) => (
                      <tr
                        key={item.id}
                        className="border-b border-slate-200 hover:bg-slate-50/50"
                      >
                        <td className="py-2.5 px-3 text-center border-r border-slate-200 text-slate-500">
                          {index + 1}
                        </td>
                        <td className="py-2.5 px-3 border-r border-slate-200 font-semibold text-slate-800">
                          {item.batch.batchNumber}
                        </td>
                        <td className="py-2.5 px-3 border-r border-slate-200 font-medium text-slate-900">
                          {item.batch.inventory.product.name}
                        </td>
                        <td className="py-2.5 px-3 text-center border-r border-slate-200 text-slate-600">
                          {item.batch.inventory.product.unit || 'Kiện'}
                        </td>
                        <td className="py-2.5 px-3 text-right border-r border-slate-200 font-bold text-slate-900">
                          {item.quantity.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-2.5 px-3 text-center text-emerald-700 font-bold text-[11px]">
                          OCOP Chuẩn
                        </td>
                      </tr>
                    ))}

                    {/* Total Row */}
                    <tr className="bg-slate-50 font-bold text-slate-900">
                      <td
                        colSpan={4}
                        className="py-2.5 px-3 text-right border-r border-slate-300 uppercase text-[11px]"
                      >
                        Tổng cộng số lượng xuất kho:
                      </td>
                      <td className="py-2.5 px-3 text-right border-r border-slate-300 text-emerald-800 text-sm">
                        {totalQuantity.toLocaleString('vi-VN')}
                      </td>
                      <td className="py-2.5 px-3 text-center text-[10px] text-slate-500">
                        {shipment.items.length} mặt hàng
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Notes & Dynamic QR */}
              <div className="grid grid-cols-3 gap-4 items-center p-3 rounded-xl border border-slate-200 mb-8 text-xs">
                <div className="col-span-2 space-y-1">
                  <p className="font-bold text-slate-800 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Ghi chú vận chuyển & Bảo quản:
                  </p>
                  <p className="text-slate-600 text-[11px]">
                    - Hàng nông sản OCOP cần vận chuyển điều kiện khô ráo, tránh
                    nhiệt độ cao.
                  </p>
                  <p className="text-slate-600 text-[11px]">
                    - Bên nhận kiểm tra nguyên đai, nguyên kiện và tem niêm
                    phong trước khi ký nhận.
                  </p>
                </div>

                <div className="col-span-1 flex items-center justify-end gap-2 pr-2">
                  <div className="text-right text-[10px] text-slate-500">
                    <p className="font-bold text-slate-700">QR Theo dõi</p>
                    <p>Quét để xác thực</p>
                  </div>
                  <div className="p-1 bg-white border border-slate-300 rounded-lg shadow-sm shrink-0">
                    <QRCodeSVG
                      value={qrTrackingUrl}
                      size={60}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 4 Signatures Section */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs pt-4 border-t border-slate-200">
              <div className="space-y-1">
                <p className="font-bold text-slate-800 uppercase text-[11px]">
                  Người lập phiếu
                </p>
                <p className="text-[10px] text-slate-400 italic">
                  (Ký, ghi rõ họ tên)
                </p>
                <div className="h-16" />
                <p className="text-[11px] font-semibold text-slate-700">
                  Thư ký kho vận
                </p>
              </div>

              <div className="space-y-1">
                <p className="font-bold text-slate-800 uppercase text-[11px]">
                  Thủ kho xuất
                </p>
                <p className="text-[10px] text-slate-400 italic">
                  (Ký, ghi rõ họ tên)
                </p>
                <div className="h-16" />
                <p className="text-[11px] font-semibold text-slate-700">
                  {shipment.originWarehouse.name}
                </p>
              </div>

              <div className="space-y-1">
                <p className="font-bold text-slate-800 uppercase text-[11px]">
                  Người giao hàng
                </p>
                <p className="text-[10px] text-slate-400 italic">
                  (Ký, ghi rõ họ tên)
                </p>
                <div className="h-16" />
                <p className="text-[11px] font-semibold text-slate-700">
                  {shipment.carrierOrganization.name}
                </p>
              </div>

              <div className="space-y-1">
                <p className="font-bold text-slate-800 uppercase text-[11px]">
                  Người nhận hàng
                </p>
                <p className="text-[10px] text-slate-400 italic">
                  (Ký, ghi rõ họ tên)
                </p>
                <div className="h-16" />
                <p className="text-[11px] font-semibold text-slate-700">
                  {shipment.destinationName}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
