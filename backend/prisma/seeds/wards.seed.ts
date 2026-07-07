import { PrismaClient, Province, Ward } from '@prisma/client';
import { generateGeoJSONAndGetPath } from './utils';

export async function seedWards(
  prisma: PrismaClient,
  provincesMap: Record<string, Province>
): Promise<Record<string, Ward>> {
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

  const wardsMap: Record<string, Ward> = {};
  for (const w of wardsData) {
    const prov = provincesMap[w.provinceName];
    if (!prov) {
      throw new Error(`Missing province reference "${w.provinceName}" for ward "${w.name}"`);
    }

    const geoInfo = generateGeoJSONAndGetPath('wards', `${prov.code}_${w.name.replace(/\s+/g, '')}`, w.lat, w.lon, 0.015);
    const createdWard = await prisma.ward.upsert({
      where: {
        provinceId_name: {
          provinceId: prov.id,
          name: w.name,
        },
      },
      update: {
        latitude: w.lat,
        longitude: w.lon,
        description: w.description,
        avatar: `https://images.unsplash.com/photo-1598978214034-d4e3b5b947db?auto=format&fit=crop&w=400&q=80`,
        geojsonPath: geoInfo.path,
        bounds: geoInfo.bounds,
      },
      create: {
        name: w.name,
        provinceId: prov.id,
        latitude: w.lat,
        longitude: w.lon,
        description: w.description,
        avatar: `https://images.unsplash.com/photo-1598978214034-d4e3b5b947db?auto=format&fit=crop&w=400&q=80`,
        geojsonPath: geoInfo.path,
        bounds: geoInfo.bounds,
      },
    });
    wardsMap[`${w.provinceName}_${w.name}`] = createdWard;
  }
  return wardsMap;
}
