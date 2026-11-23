import {
  PrismaClient,
  Province,
  SellerProfile,
  User,
  Ward,
} from '@prisma/client';

export async function seedSellerProfiles(
  prisma: PrismaClient,
  usersMap: Record<string, User>,
  provincesMap: Record<string, Province>,
  wardsMap: Record<string, Ward>,
): Promise<Record<string, SellerProfile>> {
  const profileData = [
    {
      sellerEmail: 'seller1@ocop.gov.vn',
      displayName: 'Hợp tác xã Gốm sứ Bát Tràng',
      taxCode: '0101234567',
      address: 'Số 10, Xóm 3, Xã Bát Tràng, TP. Hà Nội',
      email: 'battrang@gmail.com',
      phone: '0243888888',
      wardKey: 'TP. Hà Nội_Xã Bát Tràng',
      provinceName: 'TP. Hà Nội',
    },
    {
      sellerEmail: 'seller2@ocop.gov.vn',
      displayName: 'Hợp tác xã Mỳ gạo Hùng Lô',
      taxCode: '2601234567',
      address: 'Khu 4, Xã Hùng Lô, Việt Trì, Phú Thọ',
      email: 'mygahunglo@gmail.com',
      phone: '02103888888',
      wardKey: 'Phú Thọ_Xã Hùng Lô',
      provinceName: 'Phú Thọ',
    },
    {
      sellerEmail: 'seller3@ocop.gov.vn',
      displayName: 'Đà Lạt Gift',
      taxCode: '5801234567',
      address: 'Đường Tự Phước, Xã Xuân Thọ, Đà Lạt, Lâm Đồng',
      email: 'dalatgift@gmail.com',
      phone: '02633888888',
      wardKey: 'Lâm Đồng_Xã Xuân Thọ',
      provinceName: 'Lâm Đồng',
    },
    {
      sellerEmail: 'seller4@ocop.gov.vn',
      displayName: 'Cơ sở sản xuất muối Cần Giờ Hải Nam',
      taxCode: '0301234567',
      address: 'Ấp Lý Hòa, Xã Lý Nhơn, Cần Giờ, TP. Hồ Chí Minh',
      email: 'cangiosalt@gmail.com',
      phone: '0283888888',
      wardKey: 'TP. Hồ Chí Minh_Xã Lý Nhơn',
      provinceName: 'TP. Hồ Chí Minh',
    },
  ];

  const profiles: Record<string, SellerProfile> = {};
  for (const profile of profileData) {
    const seller = usersMap[profile.sellerEmail];
    const ward = wardsMap[profile.wardKey];
    const province = provincesMap[profile.provinceName];
    if (!seller || !ward || !province) {
      throw new Error(
        `Missing Seller or location for profile "${profile.displayName}"`,
      );
    }

    profiles[profile.displayName] = await prisma.sellerProfile.upsert({
      where: { sellerId: seller.id },
      update: {
        displayName: profile.displayName,
        taxCode: profile.taxCode,
        address: profile.address,
        email: profile.email,
        phone: profile.phone,
        wardId: ward.id,
        provinceId: province.id,
        isVerified: true,
      },
      create: {
        sellerId: seller.id,
        displayName: profile.displayName,
        taxCode: profile.taxCode,
        address: profile.address,
        email: profile.email,
        phone: profile.phone,
        wardId: ward.id,
        provinceId: province.id,
        isVerified: true,
      },
    });
  }
  return profiles;
}
