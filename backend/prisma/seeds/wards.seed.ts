import { PrismaClient, Province, Ward } from '@prisma/client';
import { generateGeoJSONAndGetPath } from './utils';

import * as fs from 'fs';
import * as path from 'path';

// Xã/Phường đại diện cho 34 tỉnh thành mới (từ 01/07/2025)
export async function seedWards(
  prisma: PrismaClient,
  provincesMap: Record<string, Province>
): Promise<Record<string, Ward>> {
  const wardsData = [
    // 01 - Tuyên Quang (Hà Giang + Tuyên Quang)
    { name: 'Phường Tân Quang',  provinceName: 'Tuyên Quang', lat: 22.1450, lon: 105.1766, desc: 'Trung tâm thương mại tỉnh Tuyên Quang.' },
    { name: 'Xã Lăng Can',       provinceName: 'Tuyên Quang', lat: 22.3201, lon: 104.9823, desc: 'Vùng chè Shan tuyết Hà Giang đặc sản núi cao.' },
    { name: 'Xã Đồng Văn',       provinceName: 'Tuyên Quang', lat: 23.2736, lon: 105.3598, desc: 'Cao nguyên đá Đồng Văn – di sản địa chất thế giới.' },

    // 02 - Cao Bằng
    { name: 'Phường Ngọc Xuân',  provinceName: 'Cao Bằng', lat: 22.6657, lon: 106.2522, desc: 'Trung tâm thành phố Cao Bằng bên bờ sông Bằng.' },
    { name: 'Xã Trùng Khánh',    provinceName: 'Cao Bằng', lat: 22.8225, lon: 106.5200, desc: 'Nổi tiếng với hạt dẻ Trùng Khánh thơm ngon.' },

    // 03 - Lai Châu
    { name: 'Phường Tân Phong',  provinceName: 'Lai Châu', lat: 22.3964, lon: 103.4591, desc: 'Trung tâm thành phố Lai Châu miền núi Tây Bắc.' },
    { name: 'Xã Sìn Hồ',         provinceName: 'Lai Châu', lat: 22.3684, lon: 103.2600, desc: 'Vùng gạo séng cù Sìn Hồ thơm dẻo nức tiếng.' },

    // 04 - Lào Cai (Lào Cai + Yên Bái)
    { name: 'Phường Cốc Lếu',    provinceName: 'Lào Cai', lat: 22.4856, lon: 103.9707, desc: 'Phố cổ Lào Cai – cửa ngõ giao thương Việt Trung.' },
    { name: 'Xã Sa Pa',          provinceName: 'Lào Cai', lat: 22.3364, lon: 103.8438, desc: 'Thị trấn sương mù – vùng rau, hoa, và dược liệu quý.' },
    { name: 'Xã Mù Cang Chải',   provinceName: 'Lào Cai', lat: 21.8200, lon: 104.0900, desc: 'Ruộng bậc thang Mù Cang Chải và gạo nếp đặc sản.' },

    // 05 - Thái Nguyên (Bắc Kạn + Thái Nguyên)
    { name: 'Phường Hoàng Văn Thụ', provinceName: 'Thái Nguyên', lat: 21.5940, lon: 105.8442, desc: 'Trung tâm thành phố Thái Nguyên – thủ phủ chè Việt.' },
    { name: 'Xã Tân Cương',      provinceName: 'Thái Nguyên', lat: 21.6667, lon: 105.7833, desc: 'Làng chè Tân Cương – chè ngon bậc nhất Việt Nam.' },
    { name: 'Xã Ba Bể',          provinceName: 'Thái Nguyên', lat: 22.4073, lon: 105.6200, desc: 'Hồ Ba Bể – vùng sản vật thiên nhiên vườn quốc gia.' },

    // 06 - Điện Biên
    { name: 'Phường Mường Thanh', provinceName: 'Điện Biên', lat: 21.3853, lon: 103.0189, desc: 'Cánh đồng Mường Thanh – gạo séng cù nổi tiếng.' },
    { name: 'Xã Tủa Chùa',       provinceName: 'Điện Biên', lat: 21.9800, lon: 103.4500, desc: 'Vùng mận hậu và lanh dệt thổ cẩm Tủa Chùa.' },

    // 07 - Lạng Sơn
    { name: 'Phường Đông Kinh',  provinceName: 'Lạng Sơn', lat: 21.8537, lon: 106.7614, desc: 'Phố Kỳ Lừa – chợ truyền thống lâu đời Lạng Sơn.' },
    { name: 'Xã Chi Lăng',       provinceName: 'Lạng Sơn', lat: 21.6500, lon: 106.7000, desc: 'Vùng na Chi Lăng ngọt thơm nức tiếng cả nước.' },

    // 08 - Sơn La
    { name: 'Phường Chiềng Lề',  provinceName: 'Sơn La', lat: 21.3259, lon: 103.9126, desc: 'Trung tâm thành phố Sơn La – cà phê Sơn La đặc sản.' },
    { name: 'Xã Mộc Châu',       provinceName: 'Sơn La', lat: 20.8440, lon: 104.6760, desc: 'Cao nguyên Mộc Châu – chè, sữa, mận tam hoa nức tiếng.' },

    // 09 - Phú Thọ (Hòa Bình + Vĩnh Phúc + Phú Thọ)
    { name: 'Phường Tiên Cát',   provinceName: 'Phú Thọ', lat: 21.4020, lon: 105.2285, desc: 'Trung tâm TP. Việt Trì – đất Tổ Hùng Vương.' },
    { name: 'Xã Hùng Lô',        provinceName: 'Phú Thọ', lat: 21.3524, lon: 105.3789, desc: 'Làng nghề mỳ gạo Hùng Lô – OCOP 3 sao.' },
    { name: 'Xã Tam Đảo',        provinceName: 'Phú Thọ', lat: 21.4700, lon: 105.6400, desc: 'Khu nghỉ mát Tam Đảo – su su, mắm tép đặc sản.' },

    // 10 - Bắc Ninh (Bắc Giang + Bắc Ninh)
    { name: 'Phường Suối Hoa',   provinceName: 'Bắc Ninh', lat: 21.1862, lon: 106.0763, desc: 'Trung tâm thành phố Bắc Ninh – làng Quan họ.' },
    { name: 'Xã Đình Bảng',      provinceName: 'Bắc Ninh', lat: 21.1500, lon: 105.9833, desc: 'Làng nghề đúc đồng Đình Bảng và bánh phu thê.' },
    { name: 'Xã Lục Ngạn',       provinceName: 'Bắc Ninh', lat: 21.3900, lon: 106.5400, desc: 'Vùng vải thiều Lục Ngạn – vải xuất khẩu số 1 Việt Nam.' },

    // 11 - Quảng Ninh
    { name: 'Phường Bãi Cháy',   provinceName: 'Quảng Ninh', lat: 20.9600, lon: 107.0700, desc: 'Trung tâm du lịch Hạ Long – hải sản tươi ngon.' },
    { name: 'Xã Vân Đồn',        provinceName: 'Quảng Ninh', lat: 21.0000, lon: 107.4200, desc: 'Huyện đảo Vân Đồn – tu hài, bào ngư đặc sản biển.' },

    // 12 - TP. Hà Nội
    { name: 'Xã Bát Tràng',      provinceName: 'TP. Hà Nội', lat: 20.9723, lon: 105.9083, desc: 'Làng gốm sứ Bát Tràng – nghề truyền thống 700 năm.' },
    { name: 'Xã Đường Lâm',      provinceName: 'TP. Hà Nội', lat: 21.1333, lon: 105.4667, desc: 'Làng cổ đá ong – chè lam, kẹo dồi đặc sản Sơn Tây.' },
    { name: 'Phường Hàng Buồm',  provinceName: 'TP. Hà Nội', lat: 21.0369, lon: 105.8515, desc: 'Phố cổ Hà Nội – ô mai, bánh cốm truyền thống.' },

    // 13 - TP. Hải Phòng (Hải Dương + TP. Hải Phòng)
    { name: 'Phường Lạch Tray',  provinceName: 'TP. Hải Phòng', lat: 20.8568, lon: 106.6733, desc: 'Trung tâm Hải Phòng – bánh đa cua, hải sản.' },
    { name: 'Xã Cát Hải',        provinceName: 'TP. Hải Phòng', lat: 20.7310, lon: 106.9940, desc: 'Đảo Cát Bà – nước mắm, mực một nắng đặc sản.' },
    { name: 'Xã Thanh Hà',       provinceName: 'TP. Hải Phòng', lat: 20.8790, lon: 106.3100, desc: 'Vải thiều Thanh Hà – đặc sản nổi tiếng Hải Dương.' },

    // 14 - Hưng Yên (Thái Bình + Hưng Yên)
    { name: 'Phường Quang Trung', provinceName: 'Hưng Yên', lat: 20.6464, lon: 106.0511, desc: 'TP. Hưng Yên – nhãn lồng đặc sản nức tiếng cả nước.' },
    { name: 'Xã Tiên Lữ',        provinceName: 'Hưng Yên', lat: 20.7430, lon: 106.1120, desc: 'Vùng trồng nhãn lồng Hưng Yên ngọt thơm.' },
    { name: 'Xã Vũ Thư',         provinceName: 'Hưng Yên', lat: 20.3600, lon: 106.3700, desc: 'Vùng nấm rơm và gạo tám xoan Thái Bình nổi tiếng.' },

    // 15 - Ninh Bình (Hà Nam + Ninh Bình + Nam Định)
    { name: 'Phường Nam Bình',   provinceName: 'Ninh Bình', lat: 20.2542, lon: 105.9728, desc: 'TP. Ninh Bình – cơm cháy, dê núi, rượu Kim Sơn.' },
    { name: 'Xã Hoa Lư',         provinceName: 'Ninh Bình', lat: 20.2820, lon: 105.8810, desc: 'Cố đô Hoa Lư – mắm tép Gia Viễn, dê núi đặc sản.' },
    { name: 'Xã Hải Hậu',        provinceName: 'Ninh Bình', lat: 20.2400, lon: 106.3900, desc: 'Làng nghề muối biển và nước mắm Hải Hậu Nam Định.' },

    // 16 - Thanh Hóa
    { name: 'Phường Lam Sơn',    provinceName: 'Thanh Hóa', lat: 19.8079, lon: 105.7756, desc: 'TP. Thanh Hóa – nem chua, bánh gai đặc sản.' },
    { name: 'Xã Cẩm Thủy',       provinceName: 'Thanh Hóa', lat: 20.2480, lon: 105.4750, desc: 'Vùng cam Giàng và mía đường Cẩm Thủy nổi tiếng.' },

    // 17 - Nghệ An
    { name: 'Phường Quang Tiến', provinceName: 'Nghệ An', lat: 18.6797, lon: 105.6820, desc: 'TP. Vinh – kẹo Cu Đơ, tương Nam Đàn đặc sản.' },
    { name: 'Xã Quỳnh Lưu',      provinceName: 'Nghệ An', lat: 19.1000, lon: 105.6300, desc: 'Vùng biển tôm chua, mực khô Quỳnh Lưu Nghệ An.' },
    { name: 'Xã Con Cuông',      provinceName: 'Nghệ An', lat: 19.0550, lon: 104.8950, desc: 'Vùng cam Vinh – cam đặc sản OCOP 4 sao Nghệ An.' },

    // 18 - Hà Tĩnh
    { name: 'Phường Bắc Hà',     provinceName: 'Hà Tĩnh', lat: 18.3556, lon: 105.9015, desc: 'TP. Hà Tĩnh – bưởi Phúc Trạch, nước mắm Kỳ Anh.' },
    { name: 'Xã Hương Sơn',      provinceName: 'Hà Tĩnh', lat: 18.5040, lon: 105.3000, desc: 'Vùng cam bù Hương Sơn và mật ong rừng đặc sản.' },

    // 19 - Quảng Trị (Quảng Bình + Quảng Trị)
    { name: 'Phường Đông Lễ',    provinceName: 'Quảng Trị', lat: 16.8167, lon: 107.0984, desc: 'TP. Đông Hà – cà phê Khe Sanh, hồ tiêu Quảng Trị.' },
    { name: 'Xã Vĩnh Linh',      provinceName: 'Quảng Trị', lat: 17.0800, lon: 107.0300, desc: 'Vùng hồ tiêu Vĩnh Linh – tiêu OCOP 5 sao xuất khẩu.' },
    { name: 'Xã Đồng Hới',       provinceName: 'Quảng Trị', lat: 17.4833, lon: 106.6000, desc: 'TP. Đồng Hới Quảng Bình – tôm hùm, cua biển đặc sản.' },

    // 20 - TP. Huế
    { name: 'Phường Phú Hội',    provinceName: 'TP. Huế', lat: 16.4637, lon: 107.5909, desc: 'Trung tâm TP. Huế – mè xửng, bánh Huế cung đình.' },
    { name: 'Xã Phú Lộc',        provinceName: 'TP. Huế', lat: 16.2160, lon: 107.8940, desc: 'Đầm Cầu Hai – ruốc, nước mắm, cá dìa đặc sản.' },

    // 21 - TP. Đà Nẵng (Quảng Nam + TP. Đà Nẵng)
    { name: 'Phường Hải Châu',   provinceName: 'TP. Đà Nẵng', lat: 16.0544, lon: 108.2022, desc: 'Trung tâm TP. Đà Nẵng – mắm cái, bánh tráng cuốn thịt heo.' },
    { name: 'Xã Hội An',         provinceName: 'TP. Đà Nẵng', lat: 15.8801, lon: 108.3350, desc: 'Phố cổ Hội An – cao lầu, mỳ Quảng, bánh mì đặc sản.' },
    { name: 'Xã Tiên Phước',     provinceName: 'TP. Đà Nẵng', lat: 15.5800, lon: 108.2800, desc: 'Vùng tiêu, quế, trầm hương Tiên Phước Quảng Nam.' },

    // 22 - Quảng Ngãi (Quảng Ngãi + Kon Tum)
    { name: 'Phường Trần Phú',   provinceName: 'Quảng Ngãi', lat: 15.1167, lon: 108.8003, desc: 'TP. Quảng Ngãi – đường phổi, mạch nha đặc sản.' },
    { name: 'Xã Lý Sơn',         provinceName: 'Quảng Ngãi', lat: 15.3800, lon: 109.1200, desc: 'Đảo Lý Sơn – tỏi Lý Sơn đặc sản độc quyền Việt Nam.' },
    { name: 'Xã Kon Tum',        provinceName: 'Quảng Ngãi', lat: 14.3544, lon: 108.0007, desc: 'TP. Kon Tum – rượu cần, sâm dây núi rừng Tây Nguyên.' },

    // 23 - Gia Lai (Gia Lai + Bình Định)
    { name: 'Phường Phù Đổng',   provinceName: 'Gia Lai', lat: 13.9833, lon: 108.0000, desc: 'TP. Pleiku – cà phê Gia Lai, mật hoa cà phê đặc sản.' },
    { name: 'Xã Mang Yang',      provinceName: 'Gia Lai', lat: 13.8200, lon: 108.3900, desc: 'Vùng cà phê Arabica và sâm Ngọc Linh Mang Yang.' },
    { name: 'Xã Quy Nhơn',       provinceName: 'Gia Lai', lat: 13.7765, lon: 109.2233, desc: 'TP. Quy Nhơn – bánh ít lá gai, rượu Bàu Đá Bình Định.' },

    // 24 - Đắk Lắk (Phú Yên + Đắk Lắk)
    { name: 'Phường Tân Lợi',    provinceName: 'Đắk Lắk', lat: 12.6667, lon: 108.0500, desc: 'TP. Buôn Ma Thuột – thủ phủ cà phê Robusta Việt Nam.' },
    { name: 'Xã Cư Kuin',        provinceName: 'Đắk Lắk', lat: 12.4900, lon: 108.1300, desc: 'Vùng sầu riêng, bơ Booth Cư Kuin Đắk Lắk.' },
    { name: 'Xã Sông Hinh',      provinceName: 'Đắk Lắk', lat: 13.0500, lon: 108.9700, desc: 'Vùng tôm hùm nước ngọt và cá thác lác Phú Yên.' },

    // 25 - Khánh Hòa (Khánh Hòa + Ninh Thuận)
    { name: 'Phường Vĩnh Hải',   provinceName: 'Khánh Hòa', lat: 12.2387, lon: 109.1967, desc: 'TP. Nha Trang – yến sào, mực một nắng đặc sản biển.' },
    { name: 'Xã Vạn Ninh',       provinceName: 'Khánh Hòa', lat: 12.6700, lon: 109.2400, desc: 'Vùng tôm hùm Bắc Vân Phong – tôm hùm đặc sản.' },
    { name: 'Xã Ninh Phước',     provinceName: 'Khánh Hòa', lat: 11.5600, lon: 108.9700, desc: 'Vùng nho Ninh Thuận – nho xanh, rượu vang đặc sản.' },

    // 26 - Lâm Đồng (Đắk Nông + Lâm Đồng + Bình Thuận)
    { name: 'Phường 1',          provinceName: 'Lâm Đồng', lat: 11.9404, lon: 108.4583, desc: 'TP. Đà Lạt – atisô, rau hoa Đà Lạt đặc sản cao nguyên.' },
    { name: 'Xã Xuân Thọ',       provinceName: 'Lâm Đồng', lat: 11.9323, lon: 108.5233, desc: 'Vùng hồng treo gió công nghệ Nhật Bản Đà Lạt.' },
    { name: 'Xã Trạm Hành',      provinceName: 'Lâm Đồng', lat: 11.8398, lon: 108.5621, desc: 'Vùng chè Cầu Đất – chè OCOP 5 sao Lâm Đồng.' },
    { name: 'Xã Tánh Linh',      provinceName: 'Lâm Đồng', lat: 11.3500, lon: 107.7700, desc: 'Vùng thanh long ruột đỏ Bình Thuận xuất khẩu.' },

    // 27 - Đồng Nai (Bình Phước + Đồng Nai)
    { name: 'Phường Tân Phong',  provinceName: 'Đồng Nai', lat: 11.0000, lon: 107.1667, desc: 'TP. Biên Hòa – bưởi Tân Triều, nem Biên Hòa đặc sản.' },
    { name: 'Xã Định Quán',      provinceName: 'Đồng Nai', lat: 11.2100, lon: 107.3900, desc: 'Vùng sầu riêng Định Quán và cacao Đồng Nai.' },
    { name: 'Xã Lộc Ninh',       provinceName: 'Đồng Nai', lat: 11.8400, lon: 106.9700, desc: 'Vùng cao su, điều và hồ tiêu Lộc Ninh Bình Phước.' },

    // 28 - Tây Ninh (Long An + Tây Ninh)
    { name: 'Phường 1',          provinceName: 'Tây Ninh', lat: 11.3100, lon: 106.1000, desc: 'TP. Tây Ninh – muối ớt Tây Ninh, bánh tráng phơi sương.' },
    { name: 'Xã Tân Biên',       provinceName: 'Tây Ninh', lat: 11.6400, lon: 105.9700, desc: 'Vùng mãng cầu Tây Ninh – mãng cầu ta ngọt đặc trưng.' },
    { name: 'Xã Tân An',         provinceName: 'Tây Ninh', lat: 10.5300, lon: 106.4200, desc: 'Vùng khóm Long An và gạo nếp đặc sản đồng bằng.' },

    // 29 - TP. Hồ Chí Minh (Bình Dương + TPHCM + BR-VT)
    { name: 'Phường Bến Nghé',   provinceName: 'TP. Hồ Chí Minh', lat: 10.7769, lon: 106.7009, desc: 'Trung tâm TPHCM – hub thương mại đặc sản cả nước.' },
    { name: 'Xã Lý Nhơn',        provinceName: 'TP. Hồ Chí Minh', lat: 10.4502, lon: 106.8291, desc: 'Vùng muối Cần Giờ – muối biển sạch chất lượng cao.' },
    { name: 'Xã Long Điền',      provinceName: 'TP. Hồ Chí Minh', lat: 10.4600, lon: 107.2300, desc: 'Vùng hải sản Bà Rịa – cá khô, mực khô, hàu đặc sản.' },
    { name: 'Xã Lái Thiêu',      provinceName: 'TP. Hồ Chí Minh', lat: 10.8800, lon: 106.6600, desc: 'Vườn trái cây Lái Thiêu Bình Dương – trái cây đặc sản.' },

    // 30 - Đồng Tháp (Tiền Giang + Đồng Tháp)
    { name: 'Phường 1',          provinceName: 'Đồng Tháp', lat: 10.5336, lon: 105.7200, desc: 'TP. Cao Lãnh – xoài Cao Lãnh, sen Đồng Tháp đặc sản.' },
    { name: 'Xã Tân Phước',      provinceName: 'Đồng Tháp', lat: 10.6400, lon: 106.2500, desc: 'Vùng khóm Tân Phước và rau đặc sản Tiền Giang.' },
    { name: 'Xã Gò Công',        provinceName: 'Đồng Tháp', lat: 10.3700, lon: 106.6700, desc: 'Vùng mắm tôm chà Gò Công – đặc sản 200 năm tuổi.' },

    // 31 - An Giang (Kiên Giang + An Giang)
    { name: 'Phường Mỹ Long',    provinceName: 'An Giang', lat: 10.3784, lon: 105.4340, desc: 'TP. Long Xuyên – khô cá tra, mắm bò hóc An Giang.' },
    { name: 'Xã Châu Đốc',       provinceName: 'An Giang', lat: 10.7049, lon: 105.1184, desc: 'Thị xã Châu Đốc – mắm cá linh, khô cá sặc rằn.' },
    { name: 'Xã Phú Quốc',       provinceName: 'An Giang', lat: 10.2270, lon: 103.9830, desc: 'Đảo Phú Quốc Kiên Giang – nước mắm, hồ tiêu đặc sản.' },

    // 32 - Vĩnh Long (Bến Tre + Vĩnh Long + Trà Vinh)
    { name: 'Phường 1',          provinceName: 'Vĩnh Long', lat: 10.2395, lon: 105.9739, desc: 'TP. Vĩnh Long – bưởi năm roi, khoai lang tím đặc sản.' },
    { name: 'Xã Chợ Lách',       provinceName: 'Vĩnh Long', lat: 10.1700, lon: 106.1500, desc: 'Vùng cây giống Chợ Lách Bến Tre – sầu riêng, chôm chôm.' },
    { name: 'Xã Cầu Kè',         provinceName: 'Vĩnh Long', lat: 9.7900, lon: 106.1300, desc: 'Vùng dừa Bến Tre và dừa xiêm Trà Vinh nức tiếng.' },

    // 33 - TP. Cần Thơ (Sóc Trăng + Hậu Giang + TP. Cần Thơ)
    { name: 'Phường An Hội',     provinceName: 'TP. Cần Thơ', lat: 10.0452, lon: 105.7469, desc: 'TP. Cần Thơ – gạo ST25, cá thác lác cườm đặc sản.' },
    { name: 'Xã Phụng Hiệp',     provinceName: 'TP. Cần Thơ', lat: 9.7800, lon: 105.8300, desc: 'Vùng mía đường và cam sành Hậu Giang.' },
    { name: 'Xã Mỹ Xuyên',       provinceName: 'TP. Cần Thơ', lat: 9.7300, lon: 105.9400, desc: 'Vùng gạo ST25 Sóc Trăng – gạo ngon nhất thế giới.' },

    // 34 - Cà Mau (Bạc Liêu + Cà Mau)
    { name: 'Phường 5',          provinceName: 'Cà Mau', lat: 9.1769, lon: 105.1500, desc: 'TP. Cà Mau – tôm khô, cua biển Cà Mau đặc sản.' },
    { name: 'Xã Năm Căn',        provinceName: 'Cà Mau', lat: 8.9700, lon: 105.0000, desc: 'Vùng rừng ngập mặn – cua Cà Mau, ba khía Bạc Liêu.' },
    { name: 'Xã Đông Hải',       provinceName: 'Cà Mau', lat: 9.2900, lon: 105.6700, desc: 'Vùng muối và tôm sú Bạc Liêu – bạch tuộc, mực biển.' },
  ];

  const hardcodedMap = new Map(wardsData.map(w => [`${w.provinceName}_${w.name}`, w]));

  const wardsFullData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'wards_full.json'), 'utf8')
  );

  const wardsMap: Record<string, Ward> = {};
  
  // Prepare insert objects
  const wardsToCreate = [];
  
  // 1. Add all hardcoded wards FIRST so they are guaranteed to exist
  for (const w of wardsData) {
    const prov = provincesMap[w.provinceName];
    if (!prov) continue;
    
    const slug = `${prov.code}_${w.name.replace(/[\s\/]+/g, '')}`;
    const geoInfo = generateGeoJSONAndGetPath('wards', slug, w.lat, w.lon, 0.015);
    
    wardsToCreate.push({
      name: w.name,
      provinceId: prov.id,
      latitude: w.lat,
      longitude: w.lon,
      description: w.desc,
      avatar: `https://images.unsplash.com/photo-1598978214034-d4e3b5b947db?auto=format&fit=crop&w=400&q=80`,
      geojsonPath: geoInfo.path,
      bounds: geoInfo.bounds,
    });
  }

  // 2. Add wards from wards_full.json
  for (const w of wardsFullData) {
    const prov = provincesMap[w.provinceName];
    if (!prov) {
      console.warn(`⚠️  Bỏ qua ward "${w.name}" – không tìm thấy tỉnh "${w.provinceName}"`);
      continue;
    }
    
    // Skip if it's already in the hardcoded map
    if (hardcodedMap.has(`${w.provinceName}_${w.name}`)) {
      continue;
    }
    
    let lat = prov.latitude;
    let lon = prov.longitude;
    let desc = `Địa phương thuộc ${prov.name}`;
    
    // Add slight offset for visualization
    lat += (Math.random() - 0.5) * 0.1;
    lon += (Math.random() - 0.5) * 0.1;

    const slug = `${prov.code}_${w.name.replace(/[\s\/]+/g, '')}`;
    const geoInfo = generateGeoJSONAndGetPath('wards', slug, lat, lon, 0.015);

    wardsToCreate.push({
      name: w.name,
      provinceId: prov.id,
      latitude: lat,
      longitude: lon,
      description: desc,
      avatar: `https://images.unsplash.com/photo-1598978214034-d4e3b5b947db?auto=format&fit=crop&w=400&q=80`,
      geojsonPath: geoInfo.path,
      bounds: geoInfo.bounds,
    });
  }

  // Use createMany for bulk performance
  await prisma.ward.createMany({
    data: wardsToCreate,
    skipDuplicates: true
  });
  
  // Retrieve back to populate map for other seeders
  const allWards = await prisma.ward.findMany({ include: { province: true } });
  for (const w of allWards) {
     wardsMap[`${w.province.name}_${w.name}`] = w;
  }

  console.log(`✅ Đã seed ${allWards.length} xã/phường cho 34 tỉnh thành`);
  return wardsMap;
}
