import { PrismaClient, Province } from '@prisma/client';
import { generateGeoJSONAndGetPath } from './utils';

export async function seedProvinces(prisma: PrismaClient): Promise<Record<string, Province>> {
  const provincesList = [
    { name: 'Hà Nội', code: '01', lat: 21.0285, lon: 105.8542 },
    { name: 'TP. Hồ Chí Minh', code: '79', lat: 10.8231, lon: 106.6297 },
    { name: 'Đà Nẵng', code: '48', lat: 16.0544, lon: 108.2022 },
    { name: 'Hải Phòng', code: '31', lat: 20.8449, lon: 106.6881 },
    { name: 'Cần Thơ', code: '92', lat: 10.0452, lon: 105.7469 },
    { name: 'Quảng Ninh', code: '22', lat: 21.0063, lon: 107.2913 },
    { name: 'Khánh Hòa', code: '56', lat: 12.2471, lon: 109.1967 },
    { name: 'Lâm Đồng', code: '68', lat: 11.9404, lon: 108.4583 },
    { name: 'Đắk Lắk', code: '66', lat: 12.6667, lon: 108.0500 },
    { name: 'Thừa Thiên Huế', code: '46', lat: 16.4633, lon: 107.5908 },
    { name: 'Nghệ An', code: '40', lat: 19.1667, lon: 104.9167 },
    { name: 'Thanh Hóa', code: '38', lat: 20.0000, lon: 105.3000 },
    { name: 'Lào Cai', code: '10', lat: 22.4856, lon: 103.9707 },
    { name: 'Điện Biên', code: '11', lat: 21.3853, lon: 103.0189 },
    { name: 'Sơn La', code: '14', lat: 21.3259, lon: 103.9126 },
    { name: 'Yên Bái', code: '15', lat: 21.7167, lon: 104.9000 },
    { name: 'Hòa Bình', code: '17', lat: 20.6833, lon: 105.3333 },
    { name: 'Thái Nguyen', code: '19', lat: 21.5939, lon: 105.8442 },
    { name: 'Phú Thọ', code: '25', lat: 21.3236, lon: 105.2125 },
    { name: 'Bắc Giang', code: '24', lat: 21.2731, lon: 106.1947 },
    { name: 'Bắc Ninh', code: '27', lat: 21.1861, lon: 106.0764 },
    { name: 'Hưng Yên', code: '33', lat: 20.6464, lon: 106.0511 },
    { name: 'Hải Dương', code: '30', lat: 20.9406, lon: 106.3331 },
    { name: 'Quảng Bình', code: '44', lat: 17.4833, lon: 106.6000 },
    { name: 'Quảng Trị', code: '45', lat: 16.7500, lon: 107.1833 },
    { name: 'Quảng Nam', code: '49', lat: 15.5500, lon: 107.9000 },
    { name: 'Bình Định', code: '52', lat: 14.1667, lon: 109.0000 },
    { name: 'Phú Yên', code: '54', lat: 13.0833, lon: 109.0833 },
    { name: 'Bình Thuận', code: '60', lat: 11.0833, lon: 108.1667 },
    { name: 'Gia Lai', code: '64', lat: 13.9833, lon: 108.0000 },
    { name: 'Đồng Nai', code: '75', lat: 11.0000, lon: 107.1667 },
    { name: 'Bà Rịa - Vũng Tàu', code: '77', lat: 10.5000, lon: 107.2000 },
    { name: 'Tiền Giang', code: '82', lat: 10.4167, lon: 106.3333 },
    { name: 'Kiên Giang', code: '91', lat: 10.0000, lon: 105.1667 },
  ];

  const provincesMap: Record<string, Province> = {};
  for (const item of provincesList) {
    const geoInfo = generateGeoJSONAndGetPath('provinces', item.code, item.lat, item.lon, 0.1);
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
  return provincesMap;
}
