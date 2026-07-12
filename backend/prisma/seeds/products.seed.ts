import { PrismaClient, Category, Business, Province, Ward, OcopLevel, ProductStatus } from '@prisma/client';

export async function seedProducts(
  prisma: PrismaClient,
  categoriesMap: Record<string, Category>,
  businessesMap: Record<string, Business>,
  provincesMap: Record<string, Province>,
  wardsMap: Record<string, Ward>,
  ocopLevelsMap: Record<number, OcopLevel>
): Promise<number> {
  const productsData = [
    {
      name: 'Bình trà gốm sứ Bát Tràng cao cấp',
      slug: 'binh-tra-gom-su-bat-trang-cao-cap',
      description: 'Bộ sản phẩm bình trà chế tác thủ công từ đất sét trắng tinh khiết nung ở nhiệt độ 1300 độ C, hoa văn vẽ tay tinh tế.',
      price: 450000,
      unit: 'Bộ',
      ocopLevel: 5,
      categoryName: 'Thủ công mỹ nghệ',
      businessName: 'Hợp tác xã Gốm sứ Bát Tràng',
      wardKey: 'TP. Hà Nội_Xã Bát Tràng',
      provinceName: 'TP. Hà Nội',
      lat: 20.973,
      lon: 105.909,
      status: ProductStatus.APPROVED,
      image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80',
    },
    {
      name: 'Mỳ gạo sạch Hùng Lô',
      slug: 'my-gao-sach-hung-lo',
      description: 'Mỳ gạo được làm từ gạo sạch nguyên chất, sợi dai, không chất bảo quản, sấy khô khép kín bảo đảm vệ sinh.',
      price: 35000,
      unit: 'Gói 500g',
      ocopLevel: 4,
      categoryName: 'Thực phẩm',
      businessName: 'Hợp tác xã Mỳ gạo Hùng Lô',
      wardKey: 'Phú Thọ_Xã Hùng Lô',
      provinceName: 'Phú Thọ',
      lat: 21.353,
      lon: 105.379,
      status: ProductStatus.APPROVED,
      image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=600&q=80',
    },
    {
      name: 'Hồng sấy treo gió Đà Lạt',
      slug: 'hong-say-treo-gio-da-lat',
      description: 'Hồng treo gió được sấy tự nhiên theo công nghệ Nhật Bản, quả mềm dẻo, ngọt thanh tự nhiên lớp mật hồng dồi dào.',
      price: 280000,
      unit: 'Hộp 500g',
      ocopLevel: 4,
      categoryName: 'Thực phẩm',
      businessName: 'Doanh nghiệp Đà Lạt Gift',
      wardKey: 'Lâm Đồng_Xã Xuân Thọ',
      provinceName: 'Lâm Đồng',
      lat: 11.933,
      lon: 108.524,
      status: ProductStatus.APPROVED,
      image: 'https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?auto=format&fit=crop&w=600&q=80',
    },
    {
      name: 'Cà phê Arabica Cầu Đất thượng hạng',
      slug: 'ca-phe-arabica-cau-dat-thuong-hang',
      description: 'Cà phê trồng tại độ cao 1600m, được thu hoạch trái chín 100%, rang xay mộc hương thơm nồng nàn quyến rũ.',
      price: 150000,
      unit: 'Túi 250g',
      ocopLevel: 5,
      categoryName: 'Đồ uống',
      businessName: 'Doanh nghiệp Đà Lạt Gift',
      wardKey: 'Lâm Đồng_Xã Trạm Hành',
      provinceName: 'Lâm Đồng',
      lat: 11.840,
      lon: 108.562,
      status: ProductStatus.APPROVED,
      image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=600&q=80',
    },
    {
      name: 'Muối hạt sạch Cần Giờ',
      slug: 'muoi-hat-sach-can-gio',
      description: 'Muối hạt kết tinh tự nhiên trên ruộng bạt, giữ nguyên khoáng chất tự nhiên, vị mặn dịu không gắt.',
      price: 25000,
      unit: 'Túi 1kg',
      ocopLevel: 3,
      categoryName: 'Thực phẩm',
      businessName: 'Cơ sở sản xuất muối Cần Giờ Hải Nam',
      wardKey: 'TP. Hồ Chí Minh_Xã Lý Nhơn',
      provinceName: 'TP. Hồ Chí Minh',
      lat: 10.451,
      lon: 106.830,
      status: ProductStatus.APPROVED,
      image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80',
    },
  ];

  let count = 0;
  for (const prod of productsData) {
    const category = categoriesMap[prod.categoryName];
    const business = businessesMap[prod.businessName];
    const ward = wardsMap[prod.wardKey];
    const prov = provincesMap[prod.provinceName];
    const ocopLevelObj = ocopLevelsMap[prod.ocopLevel];

    if (!category) {
      throw new Error(`Missing category reference "${prod.categoryName}" for product "${prod.name}"`);
    }
    if (!business) {
      throw new Error(`Missing business reference "${prod.businessName}" for product "${prod.name}"`);
    }
    if (!ward) {
      throw new Error(`Missing ward reference "${prod.wardKey}" for product "${prod.name}"`);
    }
    if (!prov) {
      throw new Error(`Missing province reference "${prod.provinceName}" for product "${prod.name}"`);
    }
    if (!ocopLevelObj) {
      throw new Error(`Missing OCOP level reference ${prod.ocopLevel} for product "${prod.name}"`);
    }

    const upsertedProduct = await prisma.product.upsert({
      where: { slug: prod.slug },
      update: {
        name: prod.name,
        description: prod.description,
        price: prod.price,
        unit: prod.unit,
        ocopLevelId: ocopLevelObj.id,
        categoryId: category.id,
        businessId: business.id,
        wardId: ward.id,
        provinceId: prov.id,
        latitude: prod.lat,
        longitude: prod.lon,
        status: prod.status,
      },
      create: {
        name: prod.name,
        slug: prod.slug,
        description: prod.description,
        price: prod.price,
        unit: prod.unit,
        ocopLevelId: ocopLevelObj.id,
        categoryId: category.id,
        businessId: business.id,
        wardId: ward.id,
        provinceId: prov.id,
        latitude: prod.lat,
        longitude: prod.lon,
        status: prod.status,
      },
      include: {
        images: true,
      },
    });

    const existingImage = upsertedProduct.images.find((img) => img.imageUrl === prod.image);
    if (!existingImage) {
      await prisma.productImage.updateMany({
        where: { productId: upsertedProduct.id },
        data: { isPrimary: false },
      });
      await prisma.productImage.create({
        data: {
          productId: upsertedProduct.id,
          imageUrl: prod.image,
          isPrimary: true,
        },
      });
    }
    count++;
  }
  return count;
}
