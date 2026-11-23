import { PrismaClient, SupplyChainStageName } from '@prisma/client';

const STAGES: Array<{
  name: SupplyChainStageName;
  displayName: string;
  icon: string;
  color: string;
  order: number;
  description: string;
}> = [
  {
    name: SupplyChainStageName.HARVEST,
    displayName: 'Thu hoạch',
    icon: 'Sprout',
    color: '#16A34A',
    order: 1,
    description: 'Nguyên liệu được thu hoạch tại vùng sản xuất',
  },
  {
    name: SupplyChainStageName.RECEIVED,
    displayName: 'Tiếp nhận nguyên liệu',
    icon: 'PackageOpen',
    color: '#2563EB',
    order: 2,
    description: 'Nguyên liệu được tiếp nhận tại cơ sở sản xuất',
  },
  {
    name: SupplyChainStageName.QUALITY_INSPECTION,
    displayName: 'Kiểm định chất lượng',
    icon: 'FlaskConical',
    color: '#7C3AED',
    order: 3,
    description: 'Kiểm tra chất lượng, an toàn thực phẩm theo tiêu chuẩn',
  },
  {
    name: SupplyChainStageName.PROCESSING,
    displayName: 'Chế biến',
    icon: 'Factory',
    color: '#D97706',
    order: 4,
    description: 'Sản phẩm được chế biến, sơ chế theo quy trình',
  },
  {
    name: SupplyChainStageName.PACKAGING,
    displayName: 'Đóng gói',
    icon: 'Box',
    color: '#0891B2',
    order: 5,
    description: 'Đóng gói thành phẩm, dán nhãn, tem OCOP',
  },
  {
    name: SupplyChainStageName.WAREHOUSE,
    displayName: 'Nhập kho',
    icon: 'Warehouse',
    color: '#059669',
    order: 6,
    description: 'Hàng hóa được nhập vào kho bảo quản',
  },
  {
    name: SupplyChainStageName.HANDOVER_TO_CARRIER,
    displayName: 'Bàn giao đơn vị vận chuyển',
    icon: 'Handshake',
    color: '#2563EB',
    order: 7,
    description:
      'Quản lý kho xác nhận xuất kho, bàn giao vận đơn và chỉ định nhân viên logistics',
  },
  {
    name: SupplyChainStageName.SHIPPING,
    displayName: 'Đang vận chuyển',
    icon: 'Truck',
    color: '#DC2626',
    order: 8,
    description: 'Nhân viên logistics xác nhận đã nhận hàng và đang vận chuyển',
  },
  {
    name: SupplyChainStageName.DISTRIBUTOR,
    displayName: 'Đại lý / Nhà phân phối',
    icon: 'Store',
    color: '#9333EA',
    order: 9,
    description: 'Hàng hóa được tiếp nhận tại đại lý phân phối',
  },
  {
    name: SupplyChainStageName.RETAIL,
    displayName: 'Bán lẻ',
    icon: 'ShoppingCart',
    color: '#EA580C',
    order: 10,
    description: 'Sản phẩm được bày bán tại điểm bán lẻ',
  },
  {
    name: SupplyChainStageName.CUSTOMER,
    displayName: 'Khách hàng',
    icon: 'User',
    color: '#0D9488',
    order: 11,
    description: 'Sản phẩm đã đến tay khách hàng cuối',
  },
];

export async function seedSupplyChainStages(prisma: PrismaClient) {
  let count = 0;
  for (const stage of STAGES) {
    await prisma.supplyChainStage.upsert({
      where: { name: stage.name },
      update: {
        displayName: stage.displayName,
        icon: stage.icon,
        color: stage.color,
        order: stage.order,
        description: stage.description,
      },
      create: stage,
    });
    count++;
  }
  return count;
}
