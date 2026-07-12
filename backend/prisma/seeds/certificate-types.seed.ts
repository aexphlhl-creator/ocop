import { PrismaClient } from '@prisma/client';

const certificateTypes = [
  { code: 'OCOP', name: 'OCOP', description: 'Chứng nhận sản phẩm OCOP' },
  { code: 'VIETGAP', name: 'VietGAP', description: 'Thực hành sản xuất nông nghiệp tốt tại Việt Nam' },
  { code: 'GLOBALGAP', name: 'GlobalGAP', description: 'Thực hành nông nghiệp tốt toàn cầu' },
  { code: 'HACCP', name: 'HACCP', description: 'Phân tích mối nguy và điểm kiểm soát tới hạn' },
  { code: 'ISO_22000', name: 'ISO 22000', description: 'Hệ thống quản lý an toàn thực phẩm' },
  { code: 'ORGANIC', name: 'Organic', description: 'Chứng nhận hữu cơ' },
  { code: 'FOOD_SAFETY', name: 'Food Safety', description: 'Chứng nhận an toàn thực phẩm' },
  { code: 'QUALITY_INSPECTION', name: 'Quality Inspection', description: 'Chứng nhận kiểm định chất lượng' },
];

export async function seedCertificateTypes(prisma: PrismaClient) {
  for (const type of certificateTypes) {
    await prisma.certificateType.upsert({
      where: { code: type.code },
      update: { name: type.name, description: type.description },
      create: type,
    });
  }

  return certificateTypes.length;
}
