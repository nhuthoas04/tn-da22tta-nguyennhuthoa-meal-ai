import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';

import * as path from 'path';

@Injectable()
export class PdfGeneratorService {
  private getVietnameseFont(): string | null {
    const windir = process.env.WINDIR || 'C:\\Windows';
    const pathsToTry = [
      path.join(windir, 'Fonts', 'arial.ttf'),
      path.join(windir, 'Fonts', 'Calibri.ttf'),
      path.join(windir, 'Fonts', 'segoeui.ttf'),
      'C:\\Windows\\Fonts\\arial.ttf',
    ];

    for (const p of pathsToTry) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }

  async generateMealPlanPdf(planData: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // Font registration for Vietnamese unicode support
      const fontPath = this.getVietnameseFont();
      if (fontPath) {
        doc.registerFont('CustomFont', fontPath);
        doc.font('CustomFont');
      }

      // Title & Header Style
      doc.fillColor('#10b981').fontSize(26).text('THỰC ĐƠN DINH DƯỠNG TUẦN', { align: 'center' });
      doc.fillColor('#6b7280').fontSize(11).text(
        `Thời gian: ${new Date(planData.weekStart).toLocaleDateString('vi-VN')} - ${new Date(planData.weekEnd).toLocaleDateString('vi-VN')}`,
        { align: 'center' }
      );
      doc.moveDown(1.5);

      // Nutrition Summary Box
      doc.fillColor('#f3f4f6').rect(40, doc.y, 515, 60).fill();
      doc.fillColor('#1f2937');
      const startY = doc.y + 12;
      doc.fontSize(12).text('Tóm tắt dinh dưỡng cả tuần:', 55, startY);
      doc.fontSize(11).text(`Tổng Calo: ${planData.totalCalories || 0} kcal`, 55, startY + 20);
      doc.text(`Calo trung bình ngày: ${planData.dailyAvgCalories || 0} kcal`, 250, startY + 20);
      
      doc.y = startY + 55;
      doc.moveDown(1);

      // Group plan items by day
      const dayLabels = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
      const mealTypesVn: { [key: string]: string } = {
        breakfast: 'Bữa Sáng',
        lunch: 'Bữa Trưa',
        dinner: 'Bữa Tối',
      };

      for (let day = 1; day <= 7; day++) {
        const dayItems = planData.items.filter((item: any) => item.dayOfWeek === day);
        
        // Draw day header
        doc.fillColor('#047857').fontSize(14).text(`• ${dayLabels[day]}`, { underline: true });
        doc.moveDown(0.3);

        if (dayItems.length === 0) {
          doc.fillColor('#9ca3af').fontSize(10).text('   Không có thực đơn được lập.');
          doc.moveDown(0.8);
          continue;
        }

        // Draw meals in day
        for (const item of dayItems) {
          const mealName = mealTypesVn[item.mealType] || item.mealType;
          const recipeName = item.recipe ? item.recipe.name : 'Chưa chọn món';
          const cal = item.calories || (item.recipe ? item.recipe.calories : 0);
          const time = item.recipe ? item.recipe.cookingTime : null;

          doc.fillColor('#1f2937').fontSize(11).text(`   - [${mealName}] `, { continued: true });
          doc.fillColor('#111827').text(`${recipeName}`, { continued: true });
          
          let details = ` (${cal} kcal`;
          if (time) details += `, ${time} phút`;
          details += `)`;
          
          doc.fillColor('#4b5563').fontSize(10).text(details);
        }
        doc.moveDown(0.8);

        // Check if page overflow
        if (doc.y > 720 && day < 7) {
          doc.addPage();
        }
      }

      // Footer
      doc.moveDown(2);
      doc.fillColor('#9ca3af').fontSize(9).text(
        'Được tạo tự động bởi Hệ thống AI Meal Planner - Ăn ngon, sống khỏe, tránh lãng phí thực phẩm.',
        { align: 'center' }
      );

      doc.end();
    });
  }

  async generateShoppingListPdf(listData: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const fontPath = this.getVietnameseFont();
      if (fontPath) {
        doc.registerFont('CustomFont', fontPath);
        doc.font('CustomFont');
      }

      // Header
      doc.fillColor('#10b981').fontSize(26).text('DANH SÁCH MUA SẮM', { align: 'center' });
      doc.fillColor('#6b7280').fontSize(11).text(
        `Thực đơn: ${listData.name || 'Danh sách mua sắm'} | Ngày tạo: ${new Date().toLocaleDateString('vi-VN')}`,
        { align: 'center' }
      );
      doc.moveDown(1.5);

      // Info Block
      doc.fillColor('#f3f4f6').rect(40, doc.y, 515, 50).fill();
      doc.fillColor('#1f2937');
      const startY = doc.y + 10;
      doc.fontSize(12).text(`Trạng thái: ${listData.status === 'completed' ? 'Đã hoàn thành' : 'Đang chuẩn bị'}`, 55, startY);
      doc.fontSize(12).text(
        `Ước tính tổng chi phí: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(listData.estimatedTotal || 0)}`,
        260,
        startY
      );

      doc.y = startY + 45;
      doc.moveDown(1.2);

      // Ingredients grouped by category
      if (!listData.groups || listData.groups.length === 0) {
        doc.fillColor('#9ca3af').fontSize(11).text('Danh sách mua sắm trống.', { align: 'center' });
      } else {
        for (const group of listData.groups) {
          doc.fillColor('#059669').fontSize(13).text(group.category, { underline: true });
          doc.moveDown(0.3);

          for (const item of group.items) {
            const purchasedCheck = item.isPurchased ? '[x]' : '[  ]';
            const name = item.ingredient.name;
            const qty = item.quantity;
            const unit = item.unit;
            const price = item.estimatedPrice
              ? ` - ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.estimatedPrice)}`
              : '';

            doc.fillColor(item.isPurchased ? '#9ca3af' : '#1f2937').fontSize(11);
            doc.text(`   ${purchasedCheck}   ${name}: ${qty} ${unit}${price}`);
          }
          doc.moveDown(0.8);

          // Check page boundary
          if (doc.y > 720) {
            doc.addPage();
          }
        }
      }

      // Footer
      doc.moveDown(2);
      doc.fillColor('#9ca3af').fontSize(9).text(
        'Chúc bạn mua sắm vui vẻ! Tiết kiệm và chống lãng phí cùng AI Meal Planner.',
        { align: 'center' }
      );

      doc.end();
    });
  }
}
