import { PrismaClient, Province, Ward, User, Business } from '@prisma/client';

export async function seedBusinesses(
  prisma: PrismaClient,
  usersMap: Record<string, User>,
  provincesMap: Record<string, Province>,
  wardsMap: Record<string, Ward>
): Promise<Record<string, Business>> {
  const seller1 = usersMap['seller1@ocop.gov.vn'];
  const seller2 = usersMap['seller2@ocop.gov.vn'];

  if (!seller1 || !seller2) {
    throw new Error('Missing required seller users for seeding businesses');
  }

  const businessData = [
    {
      name: 'Hợp tác xã Gốm sứ Bát Tràng',
      taxCode: '0101234567',
      address: 'Số 10, Xóm 3, Xã Bát Tràng, TP. Hà Nội',
      email: 'battrang@gmail.com',
      phone: '0243888888',
      ownerId: seller1.id,
      wardKey: 'TP. Hà Nội_Xã Bát Tràng',
      provinceName: 'TP. Hà Nội',
    },
    {
      name: 'Hợp tác xã Mỳ gạo Hùng Lô',
      taxCode: '2601234567',
      address: 'Khu 4, Xã Hùng Lô, Việt Trì, Phú Thọ',
      email: 'mygahunglo@gmail.com',
      phone: '02103888888',
      ownerId: seller1.id,
      wardKey: 'Phú Thọ_Xã Hùng Lô',
      provinceName: 'Phú Thọ',
    },
    {
      name: 'Doanh nghiệp Đà Lạt Gift',
      taxCode: '5801234567',
      address: 'Đường Tự Phước, Xã Xuân Thọ, Đà Lạt, Lâm Đồng',
      email: 'dalatgift@gmail.com',
      phone: '02633888888',
      ownerId: seller2.id,
      wardKey: 'Lâm Đồng_Xã Xuân Thọ',
      provinceName: 'Lâm Đồng',
    },
    {
      name: 'Cơ sở sản xuất muối Cần Giờ Hải Nam',
      taxCode: '0301234567',
      address: 'Ấp Lý Hòa, Xã Lý Nhơn, Cần Giờ, TP. Hồ Chí Minh',
      email: 'cangiosalt@gmail.com',
      phone: '0283888888',
      ownerId: seller1.id,
      wardKey: 'TP. Hồ Chí Minh_Xã Lý Nhơn',
      provinceName: 'TP. Hồ Chí Minh',
    },
  ];

  const businessesMap: Record<string, Business> = {};
  for (const b of businessData) {
    const ward = wardsMap[b.wardKey];
    const prov = provincesMap[b.provinceName];

    if (!ward) {
      throw new Error(`Missing ward reference "${b.wardKey}" for business "${b.name}"`);
    }
    if (!prov) {
      throw new Error(`Missing province reference "${b.provinceName}" for business "${b.name}"`);
    }

    const createdBus = await prisma.business.upsert({
      where: { taxCode: b.taxCode },
      update: {
        name: b.name,
        address: b.address,
        email: b.email,
        phone: b.phone,
        userId: b.ownerId,
        wardId: ward.id,
        provinceId: prov.id,
        isVerified: true,
      },
      create: {
        name: b.name,
        taxCode: b.taxCode,
        address: b.address,
        email: b.email,
        phone: b.phone,
        userId: b.ownerId,
        wardId: ward.id,
        provinceId: prov.id,
        isVerified: true,
      },
    });
    businessesMap[b.name] = createdBus;
  }
  return businessesMap;
}
