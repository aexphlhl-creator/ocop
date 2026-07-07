import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting seeding database...');

  // 1. Seed Roles
  console.log('Seeding Roles...');
  const rolesData = [
    { name: 'ADMIN', description: 'Quản trị viên hệ thống' },
    { name: 'SELLER', description: 'Chủ thể doanh nghiệp sản xuất OCOP' },
    { name: 'VISITOR', description: 'Người dùng xem bản đồ công cộng' },
  ];

  const roles = [];
  for (const role of rolesData) {
    const createdRole = await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
    roles.push(createdRole);
  }

  const adminRole = roles.find((r) => r.name === 'ADMIN')!;
  const sellerRole = roles.find((r) => r.name === 'SELLER')!;

  // 2. Seed Users
  console.log('Seeding Users...');
  const adminPasswordHash = bcrypt.hashSync('admin123', 10);
  const sellerPasswordHash1 = bcrypt.hashSync('seller123', 10);
  const sellerPasswordHash2 = bcrypt.hashSync('seller123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@ocop.gov.vn' },
    update: {},
    create: {
      email: 'admin@ocop.gov.vn',
      fullName: 'Hệ thống OCOP Việt Nam',
      passwordHash: adminPasswordHash,
      phone: '0123456789',
      roleId: adminRole.id,
      isActive: true,
    },
  });

  const seller1 = await prisma.user.upsert({
    where: { email: 'seller1@ocop.gov.vn' },
    update: {},
    create: {
      email: 'seller1@ocop.gov.vn',
      fullName: 'Doanh nghiệp Bắc Bộ',
      passwordHash: sellerPasswordHash1,
      phone: '0987654321',
      roleId: sellerRole.id,
      isActive: true,
    },
  });

  const seller2 = await prisma.user.upsert({
    where: { email: 'seller2@ocop.gov.vn' },
    update: {},
    create: {
      email: 'seller2@ocop.gov.vn',
      fullName: 'Hợp tác xã Lâm Đồng',
      passwordHash: sellerPasswordHash2,
      phone: '0909090909',
      roleId: sellerRole.id,
      isActive: true,
    },
  });

  // Helper to generate mock square GeoJSON polygon around lat, lon
  const makeGeoJSON = (lat: number, lon: number, delta = 0.05) => {
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [lon - delta, lat - delta],
            [lon + delta, lat - delta],
            [lon + delta, lat + delta],
            [lon - delta, lat + delta],
            [lon - delta, lat - delta],
          ],
        ],
      },
    };
  };

  // 3. Seed 34 Provinces
  console.log('Seeding 34 Provinces...');
  const provincesList = [
    { name: 'Hà Nội', code: 'HN', lat: 21.0285, lon: 105.8542 },
    { name: 'TP. Hồ Chí Minh', code: 'HCM', lat: 10.8231, lon: 106.6297 },
    { name: 'Đà Nẵng', code: 'DN', lat: 16.0544, lon: 108.2022 },
    { name: 'Hải Phòng', code: 'HP', lat: 20.8449, lon: 106.6881 },
    { name: 'Cần Thơ', code: 'CT', lat: 10.0452, lon: 105.7469 },
    { name: 'Quảng Ninh', code: 'QN', lat: 21.0063, lon: 107.2913 },
    { name: 'Khánh Hòa', code: 'KH', lat: 12.2471, lon: 109.1967 },
    { name: 'Lâm Đồng', code: 'LD', lat: 11.9404, lon: 108.4583 },
    { name: 'Đắk Lắk', code: 'DL', lat: 12.6667, lon: 108.0500 },
    { name: 'Thừa Thiên Huế', code: 'TTH', lat: 16.4633, lon: 107.5908 },
    { name: 'Nghệ An', code: 'NA', lat: 19.1667, lon: 104.9167 },
    { name: 'Thanh Hóa', code: 'TH', lat: 20.0000, lon: 105.3000 },
    { name: 'Lào Cai', code: 'LC', lat: 22.4856, lon: 103.9707 },
    { name: 'Điện Biên', code: 'DB', lat: 21.3853, lon: 103.0189 },
    { name: 'Sơn La', code: 'SL', lat: 21.3259, lon: 103.9126 },
    { name: 'Yên Bái', code: 'YB', lat: 21.7167, lon: 104.9000 },
    { name: 'Hòa Bình', code: 'HB', lat: 20.6833, lon: 105.3333 },
    { name: 'Thái Nguyên', code: 'TN', lat: 21.5939, lon: 105.8442 },
    { name: 'Phú Thọ', code: 'PT', lat: 21.3236, lon: 105.2125 },
    { name: 'Bắc Giang', code: 'BG', lat: 21.2731, lon: 106.1947 },
    { name: 'Bắc Ninh', code: 'BN', lat: 21.1861, lon: 106.0764 },
    { name: 'Hưng Yên', code: 'HY', lat: 20.6464, lon: 106.0511 },
    { name: 'Hải Dương', code: 'HD', lat: 20.9406, lon: 106.3331 },
    { name: 'Quảng Bình', code: 'QB', lat: 17.4833, lon: 106.6000 },
    { name: 'Quảng Trị', code: 'QT', lat: 16.7500, lon: 107.1833 },
    { name: 'Quảng Nam', code: 'QNM', lat: 15.5500, lon: 107.9000 },
    { name: 'Bình Định', code: 'BDI', lat: 14.1667, lon: 109.0000 },
    { name: 'Phú Yên', code: 'PY', lat: 13.0833, lon: 109.0833 },
    { name: 'Bình Thuận', code: 'BT', lat: 11.0833, lon: 108.1667 },
    { name: 'Gia Lai', code: 'GL', lat: 13.9833, lon: 108.0000 },
    { name: 'Đồng Nai', code: 'DONA', lat: 11.0000, lon: 107.1667 },
    { name: 'Bà Rịa - Vũng Tàu', code: 'BRVT', lat: 10.5000, lon: 107.2000 },
    { name: 'Tiền Giang', code: 'TG', lat: 10.4167, lon: 106.3333 },
    { name: 'Kiên Giang', code: 'KG', lat: 10.0000, lon: 105.1667 },
  ];

  const provincesMap: Record<string, any> = {};
  for (const item of provincesList) {
    const prov = await prisma.province.upsert({
      where: { name: item.name },
      update: {},
      create: {
        name: item.name,
        code: item.code,
        latitude: item.lat,
        longitude: item.lon,
        geojson: makeGeoJSON(item.lat, item.lon, 0.1) as any,
      },
    });
    provincesMap[item.name] = prov;
  }

  // 4. Seed Wards (Xã) for a few selected provinces
  console.log('Seeding Wards...');
  const wardsData = [
    // Hà Nội
    { name: 'Xã Bát Tràng', provinceName: 'Hà Nội', lat: 20.9723, lon: 105.9083, description: 'Làng gốm Bát Tràng lâu đời nổi tiếng Việt Nam.' },
    { name: 'Xã Đường Lâm', provinceName: 'Hà Nội', lat: 21.1333, lon: 105.4667, description: 'Làng cổ Đường Lâm với nét kiến trúc đá ong xưa cũ.' },
    // Phú Thọ
    { name: 'Xã Hùng Lô', provinceName: 'Phú Thọ', lat: 21.3524, lon: 105.3789, description: 'Làng nghề sản xuất mỳ gạo Hùng Lô đạt chuẩn OCOP.' },
    { name: 'Xã Gia Thanh', provinceName: 'Phú Thọ', lat: 21.4398, lon: 105.3123, description: 'Nổi tiếng với cây đặc sản Hồng Gia Thanh ngọt thơm.' },
    // Lâm Đồng
    { name: 'Xã Xuân Thọ', provinceName: 'Lâm Đồng', lat: 11.9323, lon: 108.5233, description: 'Vùng trồng hồng treo gió theo công nghệ Nhật Bản.' },
    { name: 'Xã Trạm Hành', provinceName: 'Lâm Đồng', lat: 11.8398, lon: 108.5621, description: 'Vùng chè và cà phê Cầu Đất chất lượng cao.' },
    // TP. Hồ Chí Minh
    { name: 'Xã Lý Nhơn', provinceName: 'TP. Hồ Chí Minh', lat: 10.4502, lon: 106.8291, description: 'Vùng sản xuất muối hạt Cần Giờ nổi tiếng Nam Bộ.' },
  ];

  const wardsMap: Record<string, any> = {};
  for (const w of wardsData) {
    const prov = provincesMap[w.provinceName];
    if (prov) {
      const createdWard = await prisma.ward.create({
        data: {
          name: w.name,
          provinceId: prov.id,
          latitude: w.lat,
          longitude: w.lon,
          description: w.description,
          avatar: `https://images.unsplash.com/photo-1598978214034-d4e3b5b947db?auto=format&fit=crop&w=400&q=80`,
          geojson: makeGeoJSON(w.lat, w.lon, 0.015) as any,
        },
      });
      wardsMap[`${w.provinceName}_${w.name}`] = createdWard;
    }
  }

  // 5. Seed Businesses
  console.log('Seeding Businesses...');
  const businessData = [
    {
      name: 'Hợp tác xã Gốm sứ Bát Tràng',
      taxCode: '0101234567',
      address: 'Số 10, Xóm 3, Xã Bát Tràng, Hà Nội',
      email: 'battrang@gmail.com',
      phone: '0243888888',
      ownerId: seller1.id,
      wardKey: 'Hà Nội_Xã Bát Tràng',
      provinceName: 'Hà Nội',
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

  const businessesMap: Record<string, any> = {};
  for (const b of businessData) {
    const ward = wardsMap[b.wardKey];
    const prov = provincesMap[b.provinceName];
    if (ward && prov) {
      const createdBus = await prisma.business.create({
        data: {
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
  }

  // 6. Seed Categories
  console.log('Seeding Categories...');
  const categoriesData = [
    { name: 'Thực phẩm', slug: 'thuc-pham', description: 'Các sản phẩm nông sản chế biến, đồ khô' },
    { name: 'Đồ uống', slug: 'do-uong', description: 'Trà, cà phê, rượu vang địa phương' },
    { name: 'Thảo dược', slug: 'thao-duoc', description: 'Dược liệu, tinh dầu, thực phẩm chức năng' },
    { name: 'Thủ công mỹ nghệ', slug: 'thu-cong-my-nghe', description: 'Gốm sứ, mây tre đan, dệt thổ cẩm' },
    { name: 'Dịch vụ du lịch nông thôn', slug: 'du-lich-nong-thon', description: 'Homestay, điểm tham quan làng nghề' },
  ];

  const categoriesMap: Record<string, any> = {};
  for (const cat of categoriesData) {
    const createdCat = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
    categoriesMap[cat.name] = createdCat;
  }

  // 7. Seed Products
  console.log('Seeding Products...');
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
      wardKey: 'Hà Nội_Xã Bát Tràng',
      provinceName: 'Hà Nội',
      lat: 20.973,
      lon: 105.909,
      status: 'APPROVED',
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
      status: 'APPROVED',
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
      status: 'APPROVED',
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
      status: 'APPROVED',
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
      status: 'APPROVED',
      image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80',
    },
  ];

  for (const prod of productsData) {
    const category = categoriesMap[prod.categoryName];
    const business = businessesMap[prod.businessName];
    const ward = wardsMap[prod.wardKey];
    const prov = provincesMap[prod.provinceName];

    if (category && business && ward && prov) {
      const createdProd = await prisma.product.create({
        data: {
          name: prod.name,
          slug: prod.slug,
          description: prod.description,
          price: prod.price,
          unit: prod.unit,
          ocopLevel: prod.ocopLevel,
          categoryId: category.id,
          businessId: business.id,
          wardId: ward.id,
          provinceId: prov.id,
          latitude: prod.lat,
          longitude: prod.lon,
          status: prod.status,
          images: {
            create: [
              {
                imageUrl: prod.image,
                isPrimary: true,
              },
            ],
          },
        },
      });
    }
  }

  // 8. Seed News
  console.log('Seeding News...');
  const newsData = [
    {
      title: 'Đẩy mạnh phát triển thương mại điện tử cho sản phẩm OCOP',
      slug: 'day-manh-phat-trien-thuong-mai-dien-tu-cho-san-pham-ocop',
      content: 'Chương trình chuyển đổi số nông thôn thúc đẩy xúc tiến thương mại nông sản OCOP của địa phương lên sàn thương mại điện tử bản đồ số nhằm tiếp cận đông đảo người tiêu dùng cả nước.',
      thumbnail: 'https://images.unsplash.com/photo-1542435503-956c469947f6?auto=format&fit=crop&w=800&q=80',
      authorId: adminUser.id,
      status: 'PUBLISHED',
    },
    {
      title: 'Bản đồ số OCOP - Giải pháp kết nối cung cầu thời đại mới',
      slug: 'ban-do-so-ocop-giai-phap-ket-noi-cung-cau-thoi-dai-moi',
      content: 'Bản đồ số OCOP giúp trực quan hóa vị trí địa lý, quy trình sản xuất sạch của từng chủ thể tại các vùng nông thôn Việt Nam, giúp nâng tầm giá trị nông sản và phát triển du lịch địa phương.',
      thumbnail: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80',
      authorId: adminUser.id,
      status: 'PUBLISHED',
    },
  ];

  for (const post of newsData) {
    await prisma.news.create({
      data: post,
    });
  }

  console.log('Database seeding successfully completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
