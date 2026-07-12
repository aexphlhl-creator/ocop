import { PrismaClient, Province } from '@prisma/client';
import { generateGeoJSONAndGetPath } from './utils';

// 34 tỉnh thành mới của Việt Nam (hiệu lực từ 01/07/2025)
// Theo Nghị quyết sắp xếp đơn vị hành chính cấp tỉnh năm 2025
export async function seedProvinces(prisma: PrismaClient): Promise<Record<string, Province>> {
  const provincesList = [
    // Miền Bắc
    { name: 'Tuyên Quang',     code: '01', lat: 22.1450, lon: 105.1766 }, // Hà Giang + Tuyên Quang
    { name: 'Cao Bằng',        code: '02', lat: 22.6657, lon: 106.2522 },
    { name: 'Lai Châu',        code: '03', lat: 22.3964, lon: 103.4591 },
    { name: 'Lào Cai',         code: '04', lat: 22.3364, lon: 104.1353 }, // Lào Cai + Yên Bái
    { name: 'Thái Nguyên',     code: '05', lat: 21.5672, lon: 105.8252 }, // Bắc Kạn + Thái Nguyên
    { name: 'Điện Biên',       code: '06', lat: 21.3853, lon: 103.0189 },
    { name: 'Lạng Sơn',        code: '07', lat: 21.8537, lon: 106.7614 },
    { name: 'Sơn La',          code: '08', lat: 21.3259, lon: 103.9126 },
    { name: 'Phú Thọ',         code: '09', lat: 21.3460, lon: 105.1755 }, // Hòa Bình + Vĩnh Phúc + Phú Thọ
    { name: 'Bắc Ninh',        code: '10', lat: 21.1862, lon: 106.0763 }, // Bắc Giang + Bắc Ninh
    { name: 'Quảng Ninh',      code: '11', lat: 21.0063, lon: 107.2925 },
    // Thủ đô & Đô thị lớn phía Bắc
    { name: 'TP. Hà Nội',      code: '12', lat: 21.0285, lon: 105.8542 },
    { name: 'TP. Hải Phòng',   code: '13', lat: 20.8449, lon: 106.6881 }, // Hải Dương + TP. Hải Phòng
    { name: 'Hưng Yên',        code: '14', lat: 20.6464, lon: 106.0511 }, // Thái Bình + Hưng Yên
    { name: 'Ninh Bình',       code: '15', lat: 20.2587, lon: 105.9745 }, // Hà Nam + Ninh Bình + Nam Định
    // Miền Trung
    { name: 'Thanh Hóa',       code: '16', lat: 19.8078, lon: 105.7768 },
    { name: 'Nghệ An',         code: '17', lat: 19.1667, lon: 104.9167 },
    { name: 'Hà Tĩnh',         code: '18', lat: 18.3417, lon: 105.9057 },
    { name: 'Quảng Trị',       code: '19', lat: 16.7500, lon: 107.1833 }, // Quảng Bình + Quảng Trị
    { name: 'TP. Huế',         code: '20', lat: 16.4637, lon: 107.5909 }, // Thừa Thiên Huế → TP. Huế
    { name: 'TP. Đà Nẵng',     code: '21', lat: 16.0544, lon: 108.2022 }, // Quảng Nam + TP. Đà Nẵng
    { name: 'Quảng Ngãi',      code: '22', lat: 15.1167, lon: 108.8000 }, // Quảng Ngãi + Kon Tum
    // Tây Nguyên & Nam Trung Bộ
    { name: 'Gia Lai',         code: '23', lat: 13.9833, lon: 108.0000 }, // Gia Lai + Bình Định
    { name: 'Đắk Lắk',        code: '24', lat: 12.7100, lon: 108.2378 }, // Phú Yên + Đắk Lắk
    { name: 'Khánh Hòa',       code: '25', lat: 12.2387, lon: 109.1967 }, // Khánh Hòa + Ninh Thuận
    { name: 'Lâm Đồng',        code: '26', lat: 11.5756, lon: 108.1429 }, // Đắk Nông + Lâm Đồng + Bình Thuận
    // Đông Nam Bộ
    { name: 'Đồng Nai',        code: '27', lat: 11.0000, lon: 107.1667 }, // Bình Phước + Đồng Nai
    { name: 'Tây Ninh',        code: '28', lat: 11.3100, lon: 106.1000 }, // Long An + Tây Ninh
    { name: 'TP. Hồ Chí Minh', code: '29', lat: 10.8231, lon: 106.6297 }, // Bình Dương + TPHCM + BR-VT
    // Đồng bằng sông Cửu Long
    { name: 'Đồng Tháp',       code: '30', lat: 10.5336, lon: 105.7200 }, // Tiền Giang + Đồng Tháp
    { name: 'An Giang',        code: '31', lat: 10.5216, lon: 105.1259 }, // Kiên Giang + An Giang
    { name: 'Vĩnh Long',       code: '32', lat: 10.2395, lon: 105.9739 }, // Bến Tre + Vĩnh Long + Trà Vinh
    { name: 'TP. Cần Thơ',     code: '33', lat: 10.0452, lon: 105.7469 }, // Sóc Trăng + Hậu Giang + TP. Cần Thơ
    { name: 'Cà Mau',          code: '34', lat: 9.1769,  lon: 105.1500 }, // Bạc Liêu + Cà Mau
  ];

  const provincesMap: Record<string, Province> = {};

  for (const item of provincesList) {
    const geoInfo = generateGeoJSONAndGetPath('provinces', item.code, item.lat, item.lon, 0.2);
    const prov = await prisma.province.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        latitude: item.lat,
        longitude: item.lon,
        geojsonPath: geoInfo.path,
        bounds: geoInfo.bounds,
      },
      create: {
        name: item.name,
        code: item.code,
        latitude: item.lat,
        longitude: item.lon,
        geojsonPath: geoInfo.path,
        bounds: geoInfo.bounds,
      },
    });
    provincesMap[item.name] = prov;
  }

  console.log(`✅ Đã seed ${provincesList.length} tỉnh thành mới (theo cơ cấu 01/07/2025)`);
  return provincesMap;
}
