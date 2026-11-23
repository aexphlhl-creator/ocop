export function lotStatusLabel(batch: {
  lifecycleStatus?: string; status?: string; quantity?: number;
  qualityStatus?: string; expiryDate?: string | null;
}) {
  if (batch.status === 'RECALLED' || batch.lifecycleStatus === 'RECALLED') return 'Đã thu hồi';
  if (batch.status === 'EXPIRED' || (batch.expiryDate && new Date(batch.expiryDate) <= new Date())) return 'Hết hạn';
  const labels: Record<string, string> = {
    DRAFT: 'Nháp — chưa nhập kho', SUBMITTED: 'Chờ tiếp nhận', QUARANTINED: 'Cách ly — chờ QA',
    QC_PASSED: 'Đạt QC — chưa phát hành', REJECTED: 'Không đạt QC', CLOSED: 'Đã đóng',
  };
  if (labels[batch.lifecycleStatus ?? '']) return labels[batch.lifecycleStatus!];
  if (batch.quantity === 0 || batch.status === 'DEPLETED') return 'Hết tồn kho';
  if (batch.lifecycleStatus === 'RELEASED' && batch.status === 'ACTIVE' && batch.qualityStatus === 'PASSED') return 'Đã phát hành';
  return 'Chưa được phép xuất bán';
}
