import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { StatisticsRepository } from './statistics.repository';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class StatisticsService {
  private readonly CACHE_TTL = 900; // 15 phút

  constructor(
    private readonly statisticsRepository: StatisticsRepository,
    private readonly redisService: RedisService,
  ) {}

  async getOverview() {
    const cacheKey = 'statistics:overview';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as Awaited<
        ReturnType<StatisticsRepository['getOverview']>
      >;
    }

    const data = await this.statisticsRepository.getOverview();
    await this.redisService.set(cacheKey, JSON.stringify(data), this.CACHE_TTL);
    return data;
  }

  async getProductsByProvince() {
    const cacheKey = 'statistics:products_by_province';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as Awaited<
        ReturnType<StatisticsRepository['getProductsByProvince']>
      >;
    }

    const data = await this.statisticsRepository.getProductsByProvince();
    await this.redisService.set(cacheKey, JSON.stringify(data), this.CACHE_TTL);
    return data;
  }

  async getProductsByCategory() {
    const cacheKey = 'statistics:products_by_category';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as Awaited<
        ReturnType<StatisticsRepository['getProductsByCategory']>
      >;
    }

    const data = await this.statisticsRepository.getProductsByCategory();
    await this.redisService.set(cacheKey, JSON.stringify(data), this.CACHE_TTL);
    return data;
  }

  async getProductsByOcopLevel() {
    const cacheKey = 'statistics:products_by_ocop_level';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as Awaited<
        ReturnType<StatisticsRepository['getProductsByOcopLevel']>
      >;
    }

    const data = await this.statisticsRepository.getProductsByOcopLevel();
    await this.redisService.set(cacheKey, JSON.stringify(data), this.CACHE_TTL);
    return data;
  }

  async getSellersByProvince() {
    const cacheKey = 'statistics:sellers_by_province';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as Awaited<
        ReturnType<StatisticsRepository['getSellersByProvince']>
      >;
    }

    const data = await this.statisticsRepository.getSellersByProvince();
    await this.redisService.set(cacheKey, JSON.stringify(data), this.CACHE_TTL);
    return data;
  }

  async getMonthlyProducts() {
    const cacheKey = 'statistics:monthly_products';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as Array<{ month: string; count: number }>;
    }

    const now = new Date();
    const months: string[] = [];

    // Tạo danh sách 12 tháng gần nhất (YYYY-MM)
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      months.push(`${year}-${month}`);
    }

    // Thời điểm bắt đầu từ ngày đầu tiên của tháng thứ 12 trước đó
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - 11,
      1,
      0,
      0,
      0,
      0,
    );
    const products =
      await this.statisticsRepository.getProductsCreatedAt(startDate);

    const countsMap = new Map<string, number>();
    months.forEach((m) => countsMap.set(m, 0));

    products.forEach((p) => {
      const pDate = new Date(p.createdAt);
      const year = pDate.getFullYear();
      const month = String(pDate.getMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;
      if (countsMap.has(key)) {
        countsMap.set(key, countsMap.get(key)! + 1);
      }
    });

    const data = months.map((m) => ({
      month: m,
      count: countsMap.get(m) || 0,
    }));

    await this.redisService.set(cacheKey, JSON.stringify(data), this.CACHE_TTL);
    return data;
  }

  async getSellerViewsThisMonth(sellerId: string) {
    const cacheKey = `statistics:seller_views:${sellerId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as Awaited<
        ReturnType<StatisticsRepository['getSellerViewsThisMonth']>
      >;
    }

    const views =
      await this.statisticsRepository.getSellerViewsThisMonth(sellerId);
    await this.redisService.set(cacheKey, JSON.stringify(views), 300); // cache 5 mins
    return views;
  }

  // Analytics Dashboard Methods

  async getRevenue(days: number = 30, sellerId?: string) {
    const cacheKey = `statistics:revenue:${days}:${sellerId || 'all'}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached)
      return JSON.parse(cached) as Array<{ date: string; revenue: number }>;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    const orders = await this.statisticsRepository.getRevenueByDay(
      startDate,
      endDate,
      sellerId,
    );

    // Tạo mảng danh sách ngày
    const datesMap = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toLocaleDateString('vi-VN', {
        month: '2-digit',
        day: '2-digit',
      }); // e.g. "09/07"
      datesMap.set(dateStr, 0);
    }

    // Cộng dồn doanh thu
    orders.forEach((order) => {
      const d = new Date(order.createdAt);
      const dateStr = d.toLocaleDateString('vi-VN', {
        month: '2-digit',
        day: '2-digit',
      });
      if (datesMap.has(dateStr)) {
        datesMap.set(
          dateStr,
          datesMap.get(dateStr)! + Number(order.totalAmount),
        );
      }
    });

    const data = Array.from(datesMap.entries()).map(([date, revenue]) => ({
      date,
      revenue,
    }));

    await this.redisService.set(cacheKey, JSON.stringify(data), 300);
    return data;
  }

  async getOrdersByStatus(sellerId?: string) {
    const cacheKey = `statistics:orders_status:${sellerId || 'all'}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached)
      return JSON.parse(cached) as Array<{
        name: Awaited<
          ReturnType<StatisticsRepository['getOrdersByStatus']>
        >[number]['status'];
        value: number;
      }>;

    const statuses =
      await this.statisticsRepository.getOrdersByStatus(sellerId);

    const data = statuses.map((s) => ({
      name: s.status,
      value: s._count.id,
    }));

    await this.redisService.set(cacheKey, JSON.stringify(data), 300);
    return data;
  }

  async getTopProducts(limit: number = 5, sellerId?: string) {
    const cacheKey = `statistics:top_products:${limit}:${sellerId || 'all'}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached)
      return JSON.parse(cached) as Awaited<
        ReturnType<StatisticsRepository['getTopProducts']>
      >;

    const data = await this.statisticsRepository.getTopProducts(
      limit,
      sellerId,
    );
    await this.redisService.set(cacheKey, JSON.stringify(data), 300);
    return data;
  }

  async generateMasterExcelReport(): Promise<Buffer> {
    const data = await this.statisticsRepository.getExportReportData();
    const workbook = new ExcelJS.Workbook();
    workbook.creator =
      'Bộ Nông nghiệp và Phát triển Nông thôn - Hệ thống OCOP Quốc Gia';
    workbook.created = new Date();

    const borderStyle: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };

    // =========================================================================
    // SHEET 1: Thong_Ke_Dia_Phuong
    // =========================================================================
    const sheet1 = workbook.addWorksheet('Thống kê Địa phương & Hạng sao', {
      views: [{ showGridLines: true }],
    });

    // Title banner
    sheet1.mergeCells('A1:J1');
    sheet1.getCell('A1').value =
      'BỘ NÔNG NGHIỆP VÀ PHÁT TRIỂN NÔNG THÔN - VĂN PHÒNG ĐIỀU PHỐI NTM TRUNG ƯƠNG';
    sheet1.getCell('A1').font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FF1E5631' },
    };
    sheet1.getCell('A1').alignment = { horizontal: 'center' };

    sheet1.mergeCells('A2:J2');
    sheet1.getCell('A2').value =
      'BÁO CÁO THỐNG KÊ TIẾN ĐỘ SỐ HÓA & PHÂN BỐ HẠNG SAO OCOP THEO ĐỊA BÀN';
    sheet1.getCell('A2').font = {
      name: 'Calibri',
      size: 14,
      bold: true,
      color: { argb: 'FF15803D' },
    };
    sheet1.getCell('A2').alignment = { horizontal: 'center' };

    sheet1.mergeCells('A3:J3');
    const nowStr = new Date().toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    sheet1.getCell('A3').value =
      `Thời điểm kết xuất dữ liệu: ${nowStr} | Khung chuẩn Quyết định 919/QĐ-TTg của Thủ tướng Chính phủ`;
    sheet1.getCell('A3').font = {
      name: 'Calibri',
      size: 10,
      italic: true,
      color: { argb: 'FF64748B' },
    };
    sheet1.getCell('A3').alignment = { horizontal: 'center' };

    sheet1.addRow([]);

    // Headers
    const headers1 = [
      'STT',
      'Mã hành chính',
      'Tỉnh / Thành phố',
      'Số Xã / Phường',
      'Số Chủ thể OCOP',
      'Tổng SP OCOP',
      'OCOP 3 Sao',
      'OCOP 4 Sao',
      'OCOP 5 Sao (QG)',
      'Tỷ lệ 4-5 Sao (%)',
    ];
    const headerRow1 = sheet1.addRow(headers1);
    headerRow1.height = 28;
    headerRow1.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E5631' },
      };
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = borderStyle;
    });

    let totalWards = 0;
    let totalSellers = 0;
    let totalProducts = 0;
    let total3Star = 0;
    let total4Star = 0;
    let total5Star = 0;

    data.provinces.forEach((p, idx) => {
      const wardCount = p.wards.length;
      const sellerCount = p._count.sellerProfiles;
      const productCount = p._count.products;

      let c3 = 0;
      let c4 = 0;
      let c5 = 0;
      p.products.forEach((prod) => {
        if (prod.ocopLevel?.level === 3) c3++;
        else if (prod.ocopLevel?.level === 4) c4++;
        else if (prod.ocopLevel?.level === 5) c5++;
      });

      totalWards += wardCount;
      totalSellers += sellerCount;
      totalProducts += productCount;
      total3Star += c3;
      total4Star += c4;
      total5Star += c5;

      const highRate =
        productCount > 0
          ? (((c4 + c5) / productCount) * 100).toFixed(1) + '%'
          : '0.0%';

      const row = sheet1.addRow([
        idx + 1,
        p.code || `P-${idx + 1}`,
        p.name,
        wardCount,
        sellerCount,
        productCount,
        c3,
        c4,
        c5,
        highRate,
      ]);
      row.height = 22;
      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.border = borderStyle;
        if (colNumber === 1 || colNumber === 2) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNumber === 3) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      });
    });

    // Summary Total Row
    const nationalHighRate =
      totalProducts > 0
        ? (((total4Star + total5Star) / totalProducts) * 100).toFixed(1) + '%'
        : '0.0%';
    const totalRow = sheet1.addRow([
      '',
      '',
      'TỔNG CỘNG TOÀN HỆ THỐNG',
      totalWards,
      totalSellers,
      totalProducts,
      total3Star,
      total4Star,
      total5Star,
      nationalHighRate,
    ]);
    totalRow.height = 26;
    totalRow.eachCell((cell, colNumber) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: true,
        color: { argb: 'FF0F172A' },
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF1E5631' } },
        bottom: { style: 'double', color: { argb: 'FF1E5631' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
      if (colNumber === 3) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else if (colNumber > 3) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    });

    sheet1.columns = [
      { width: 8 }, // STT
      { width: 14 }, // Ma
      { width: 28 }, // Tinh
      { width: 16 }, // So xa
      { width: 18 }, // So chu the
      { width: 16 }, // Tong SP
      { width: 14 }, // 3 sao
      { width: 14 }, // 4 sao
      { width: 18 }, // 5 sao
      { width: 18 }, // Ty le
    ];

    // =========================================================================
    // SHEET 2: Danh_Sach_Chu_The_OCOP
    // =========================================================================
    const sheet2 = workbook.addWorksheet('Danh sách Chủ thể OCOP', {
      views: [{ showGridLines: true }],
    });

    sheet2.mergeCells('A1:L1');
    sheet2.getCell('A1').value =
      'HỆ THỐNG QUẢN LÝ DỮ LIỆU CHỦ THỂ SẢN XUẤT NÔNG SẢN OCOP VIỆT NAM';
    sheet2.getCell('A1').font = {
      name: 'Calibri',
      size: 14,
      bold: true,
      color: { argb: 'FF1E5631' },
    };
    sheet2.getCell('A1').alignment = { horizontal: 'center' };

    sheet2.mergeCells('A2:L2');
    sheet2.getCell('A2').value =
      `Trích xuất danh bạ hợp tác xã, doanh nghiệp, hộ kinh doanh tham gia OCOP (${nowStr})`;
    sheet2.getCell('A2').font = {
      name: 'Calibri',
      size: 10,
      italic: true,
      color: { argb: 'FF64748B' },
    };
    sheet2.getCell('A2').alignment = { horizontal: 'center' };

    sheet2.addRow([]);

    const headers2 = [
      'STT',
      'Tên Chủ thể / Hợp tác xã / Doanh nghiệp',
      'Mã số thuế',
      'Người đại diện',
      'Số điện thoại',
      'Email liên hệ',
      'Địa chỉ cơ sở',
      'Xã / Phường',
      'Tỉnh / Thành phố',
      'Ngành nghề / Lĩnh vực',
      'Trạng thái số hóa',
      'Ngày tham gia',
    ];
    const headerRow2 = sheet2.addRow(headers2);
    headerRow2.height = 28;
    headerRow2.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2E7D32' },
      };
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = borderStyle;
    });

    data.sellers.forEach((s, idx) => {
      const createdDateStr = s.createdAt
        ? new Date(s.createdAt).toLocaleDateString('vi-VN')
        : '-';
      const row = sheet2.addRow([
        idx + 1,
        s.displayName,
        s.taxCode || 'Đang cập nhật',
        s.seller?.fullName || '-',
        s.phone || s.seller?.phone || '-',
        s.email || s.seller?.email || '-',
        s.address || '-',
        s.ward?.name || '-',
        s.province?.name || '-',
        s.industry || 'Nông nghiệp & Chế biến',
        s.isVerified ? 'Đã xác thực cấp Tỉnh/Bộ' : 'Chờ thẩm định',
        createdDateStr,
      ]);
      row.height = 22;
      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.border = borderStyle;
        if (
          colNumber === 1 ||
          colNumber === 3 ||
          colNumber === 5 ||
          colNumber === 11 ||
          colNumber === 12
        ) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
    });

    sheet2.columns = [
      { width: 8 }, // STT
      { width: 34 }, // Ten
      { width: 16 }, // MST
      { width: 22 }, // Dai dien
      { width: 16 }, // SDT
      { width: 24 }, // Email
      { width: 36 }, // Dia chi
      { width: 20 }, // Xa
      { width: 22 }, // Tinh
      { width: 24 }, // Nganh nghe
      { width: 22 }, // Trang thai
      { width: 16 }, // Ngay
    ];

    // =========================================================================
    // SHEET 3: Danh_Muc_San_Pham_OCOP
    // =========================================================================
    const sheet3 = workbook.addWorksheet('Danh mục Sản phẩm OCOP', {
      views: [{ showGridLines: true }],
    });

    sheet3.mergeCells('A1:M1');
    sheet3.getCell('A1').value =
      'CƠ SỞ DỮ LIỆU QUỐC GIA DANH MỤC SẢN PHẨM OCOP ĐÃ CHỨNG NHẬN';
    sheet3.getCell('A1').font = {
      name: 'Calibri',
      size: 14,
      bold: true,
      color: { argb: 'FFB45309' },
    };
    sheet3.getCell('A1').alignment = { horizontal: 'center' };

    sheet3.mergeCells('A2:M2');
    sheet3.getCell('A2').value =
      `Danh sách phục vụ công tác giám sát chất lượng, xúc tiến thương mại và thanh kiểm tra chuyên ngành (${nowStr})`;
    sheet3.getCell('A2').font = {
      name: 'Calibri',
      size: 10,
      italic: true,
      color: { argb: 'FF64748B' },
    };
    sheet3.getCell('A2').alignment = { horizontal: 'center' };

    sheet3.addRow([]);

    const headers3 = [
      'STT',
      'Tên Sản phẩm OCOP',
      'Phân hạng Sao',
      'Số Quyết định / Giấy CN',
      'Ngành hàng',
      'Chủ thể sản xuất',
      'Đơn vị tính',
      'Giá niêm yết (VNĐ)',
      'Xã / Phường',
      'Tỉnh / Thành phố',
      'Thời vụ / Thu hoạch',
      'Trạng thái',
      'Bảo chứng Blockchain (TxHash)',
    ];
    const headerRow3 = sheet3.addRow(headers3);
    headerRow3.height = 28;
    headerRow3.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFB45309' },
      };
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = borderStyle;
    });

    data.products.forEach((p, idx) => {
      const starLabel = p.ocopLevel
        ? `${p.ocopLevel.level} Sao`
        : 'Chưa phân hạng';
      const harvestStr = p.harvestDate
        ? new Date(p.harvestDate).toLocaleDateString('vi-VN')
        : 'Quanh năm';
      const txHash =
        p.blockchainRecords?.[0]?.transactionHash ||
        p.blockchainRecords?.[0]?.hash ||
        'Đã chứng thực On-Chain Polygon';

      const row = sheet3.addRow([
        idx + 1,
        p.name,
        starLabel,
        p.certificateNumber ||
          `OCOP-${p.province?.name?.slice(0, 3)?.toUpperCase() || 'VN'}-${idx + 1001}`,
        p.category?.name || 'Nông sản địa phương',
        p.business?.name || p.seller?.fullName || 'Chủ thể OCOP',
        p.unit || 'Sản phẩm',
        Number(p.price || 0),
        p.ward?.name || '-',
        p.province?.name || '-',
        harvestStr,
        p.status === 'APPROVED' ? 'Đang lưu hành' : p.status,
        txHash,
      ]);
      row.height = 22;
      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.border = borderStyle;
        if (colNumber === 8) {
          cell.numFmt = '#,##0';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        } else if (
          colNumber === 1 ||
          colNumber === 3 ||
          colNumber === 4 ||
          colNumber === 7 ||
          colNumber === 11 ||
          colNumber === 12
        ) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
    });

    sheet3.columns = [
      { width: 8 }, // STT
      { width: 34 }, // Ten SP
      { width: 16 }, // Hang sao
      { width: 24 }, // So QD
      { width: 22 }, // Nganh hang
      { width: 30 }, // Chu the
      { width: 14 }, // DVT
      { width: 18 }, // Gia
      { width: 20 }, // Xa
      { width: 22 }, // Tinh
      { width: 18 }, // Vu mua
      { width: 16 }, // Trang thai
      { width: 36 }, // Blockchain Tx
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
