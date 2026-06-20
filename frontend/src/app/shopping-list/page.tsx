'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import api, { shoppingListAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { HiPlus, HiCheck, HiTrash, HiShoppingCart, HiPrinter, HiClipboardCopy, HiOutlineDownload, HiShare } from 'react-icons/hi';
import MealAIShareSheetModal from './MealAIShareSheetModal';

export default function ShoppingListPage() {
  const { user } = useAuth();
  const [lists, setLists] = useState<any[]>([]);
  const [selectedList, setSelectedList] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (user) loadLists();
    else setLoading(false);
  }, [user]);

  const loadLists = async () => {
    try {
      const res = await shoppingListAPI.getAll();
      setLists(res.data.data || []);
    } catch {
      console.error('Failed to load lists');
    } finally {
      setLoading(false);
    }
  };

  const loadListDetail = async (id: string) => {
    try {
      const res = await shoppingListAPI.getById(id);
      setSelectedList(res.data);
    } catch {
      toast.error('Không thể tải danh sách');
    }
  };

  const togglePurchased = async (itemId: string, isPurchased: boolean) => {
    if (!selectedList) return;
    try {
      await shoppingListAPI.markPurchased(selectedList.id, itemId, !isPurchased);
      loadListDetail(selectedList.id);
    } catch {
      toast.error('Có lỗi xảy ra');
    }
  };

  const deleteList = async (id: string) => {
    if (!confirm('Xóa danh sách mua sắm này?')) return;
    try {
      await shoppingListAPI.delete(id);
      toast.success('Đã xóa');
      setSelectedList(null);
      loadLists();
    } catch {
      toast.error('Có lỗi xảy ra');
    }
  };

  const copyAsNote = () => {
    if (!selectedList) return;
    
    let text = `📋 DANH SÁCH MUA SẮM: ${selectedList.name}\n`;
    if (selectedList.estimatedTotal > 0) {
      text += `💰 Ước tính: ~${selectedList.estimatedTotal.toLocaleString()}đ\n`;
    }
    text += `=================================\n\n`;
    
    selectedList.groups?.forEach((group: any) => {
      text += `📂 ${group.category.toUpperCase()}\n`;
      group.items.forEach((item: any) => {
        const status = item.isPurchased ? ' [x] ' : ' [ ] ';
        text += `${status}${item.ingredient.name}: ${item.quantity} ${item.unit}`;
        if (item.estimatedPrice > 0) {
          text += ` (~${item.estimatedPrice.toLocaleString()}đ)`;
        }
        text += `\n`;
      });
      text += `\n`;
    });
    
    text += `=================================\n`;
    text += `Tạo tự động từ hệ thống MealAI 🤖`;
    
    navigator.clipboard.writeText(text);
    toast.success('Đã sao chép danh sách mua sắm dưới dạng ghi chú!');
  };

  const printList = () => {
    if (!selectedList) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Trình duyệt đã chặn mở cửa sổ mới. Vui lòng cho phép pop-up.');
      return;
    }
    
    let html = `
      <html>
      <head>
        <title>Danh sách mua sắm - ${selectedList.name}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 40px;
            color: #333;
          }
          h1 {
            font-size: 24px;
            margin-bottom: 5px;
            color: #10b981;
          }
          .meta {
            font-size: 14px;
            color: #666;
            margin-bottom: 25px;
            border-bottom: 2px solid #eee;
            padding-bottom: 10px;
          }
          .category {
            margin-bottom: 20px;
          }
          .category-title {
            font-size: 16px;
            font-weight: bold;
            color: #374151;
            background-color: #f3f4f6;
            padding: 6px 12px;
            border-radius: 6px;
            margin-bottom: 10px;
            text-transform: uppercase;
          }
          .item {
            display: flex;
            justify-content: space-between;
            padding: 8px 12px;
            border-bottom: 1px dashed #e5e7eb;
            font-size: 14px;
          }
          .item-left {
            display: flex;
            align-items: center;
          }
          .checkbox {
            width: 14px;
            height: 14px;
            border: 1px solid #9ca3af;
            border-radius: 3px;
            margin-right: 10px;
            display: inline-block;
          }
          .item-name-purchased {
            text-decoration: line-through;
            color: #9ca3af;
          }
          .item-right {
            font-weight: bold;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #9ca3af;
            border-top: 1px solid #eee;
            padding-top: 10px;
          }
          @media print {
            body { margin: 20px; }
          }
        </style>
      </head>
      <body>
        <h1>📋 Danh sách mua sắm</h1>
        <div class="meta">
          <strong>Tên danh sách:</strong> ${selectedList.name}<br/>
          ${selectedList.estimatedTotal > 0 ? `<strong>Ước tính tổng cộng:</strong> ~${selectedList.estimatedTotal.toLocaleString()}đ<br/>` : ''}
          <strong>Ngày in:</strong> ${new Date().toLocaleDateString('vi-VN')}
        </div>
    `;
    
    selectedList.groups?.forEach((group: any) => {
      html += `
        <div class="category">
          <div class="category-title">${group.category}</div>
      `;
      group.items.forEach((item: any) => {
        html += `
          <div class="item">
            <div class="item-left">
               <span class="checkbox"></span>
               <span class="${item.isPurchased ? 'item-name-purchased' : ''}">${item.ingredient.name}</span>
            </div>
            <div class="item-right">${item.quantity} ${item.unit}</div>
          </div>
        `;
      });
      html += `</div>`;
    });
    
    html += `
        <div class="footer">
          Tạo tự động bằng hệ thống MealAI 🤖
        </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleExportPDF = async () => {
    if (!selectedList) {
      toast.error('Chưa chọn danh sách mua sắm để xuất PDF');
      return;
    }
    const toastId = toast.loading('Đang chuẩn bị file PDF danh sách mua sắm...');
    try {
      const res = await api.get(`/shopping-lists/${selectedList.id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `danh_sach_mua_sam_${selectedList.name.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Đã tải xuống file PDF danh sách mua sắm thành công!', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('Có lỗi xảy ra khi tải file PDF', { id: toastId });
    }
  };

  if (!user) {
    return (
      <div className="text-center py-20 bg-brand-light-bg min-h-screen flex flex-col justify-center items-center">
        <p className="text-5xl mb-4 animate-brand-float">🛒</p>
        <p className="text-slate-500">Vui lòng <Link href="/login" className="text-brand-primary font-bold underline hover:text-brand-primary-hover">đăng nhập</Link></p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-6 bg-brand-light-bg min-h-screen">
      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl font-bold text-slate-900">Danh sách mua sắm 🛒</h1>
          <div className="badge-ai">🤖 AI Tự Động</div>
        </div>
        <p className="text-sm text-slate-500 mt-1">Tự động tạo từ thực đơn tuần, loại bỏ những nguyên liệu đã có sẵn trong tủ lạnh</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
        {/* Lists Sidebar */}
        <div className="space-y-3">
          <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Danh sách</h2>

          {loading ? (
            <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="bg-white rounded-brand-md border border-brand-light-border h-20 animate-pulse shadow-brand-sm" />)}</div>
          ) : lists.length === 0 ? (
            <div className="card-dashboard p-8 text-center bg-white">
              <p className="text-sm text-slate-500 font-medium">Chưa có danh sách nào. Hãy lên thực đơn tuần trước!</p>
              <Link href="/meal-planner" className="text-sm text-brand-primary font-bold hover:underline mt-2 inline-block transition-all">
                Đi tới Thực đơn →
              </Link>
            </div>
          ) : (
            lists.map((list: any) => (
              <button
                key={list.id}
                onClick={() => loadListDetail(list.id)}
                className={`w-full text-left bg-white rounded-brand-md border p-4 transition-all hover:shadow-brand-md hover:-translate-y-0.5 cursor-pointer ${
                  selectedList?.id === list.id ? 'border-brand-primary ring-2 ring-brand-primary/10 shadow-brand-glow' : 'border-brand-light-border shadow-brand-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900 text-sm line-clamp-1">{list.name}</p>
                  <span className={`px-2.5 py-0.5 rounded-brand-sm text-[10px] font-bold uppercase tracking-wider ${
                    list.status === 'completed' ? 'bg-brand-success/15 text-brand-success border border-brand-success/20' :
                    list.status === 'in_progress' ? 'bg-brand-warning/15 text-brand-warning border border-brand-warning/20' :
                    'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}>
                    {list.status === 'completed' ? 'Xong' : list.status === 'in_progress' ? 'Đang mua' : 'Mới'}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3 text-xs text-slate-400 font-medium">
                  <span>{list.purchasedItems}/{list.totalItems} mục</span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                  <div
                    className="bg-gradient-to-r from-brand-primary to-brand-secondary h-1.5 rounded-full transition-all"
                    style={{ width: `${list.totalItems > 0 ? (list.purchasedItems / list.totalItems) * 100 : 0}%` }}
                  />
                </div>
              </button>
            ))
          )}
        </div>

        {/* Selected List Detail */}
        <div className="lg:col-span-2">
          {!selectedList ? (
            <div className="card-dashboard p-16 text-center">
              <HiShoppingCart className="text-5xl text-brand-primary/45 mx-auto mb-3 animate-brand-float" />
              <p className="text-slate-500 font-medium">Chọn một danh sách ở cột bên trái để xem chi tiết</p>
            </div>
          ) : (
            <div className="card-dashboard p-0 divide-y divide-brand-light-border overflow-hidden bg-white">
              {/* List Header */}
              <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{selectedList.name}</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShareOpen(true)}
                    className="btn-outline-sm gap-1.5 font-bold text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                    title="Chia sẻ danh sách mua sắm qua các ứng dụng"
                  >
                    <HiShare className="text-base" />
                    <span>Chia sẻ</span>
                  </button>
                  <button
                    onClick={() => deleteList(selectedList.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-brand-sm border border-brand-danger/30 bg-white text-brand-danger hover:bg-brand-danger/10 transition-all cursor-pointer"
                    title="Xóa danh sách"
                  >
                    <HiTrash className="text-base" />
                  </button>
                </div>
              </div>

              {/* Grouped Items (Section A: NGUYÊN LIỆU CẦN MUA) */}
              <div className="divide-y divide-brand-light-border">
                <div className="p-5 bg-emerald-50/30 border-b border-emerald-100">
                  <h4 className="font-bold text-emerald-800 text-sm flex items-center gap-2">
                    <span>🛒</span> NGUYÊN LIỆU CẦN MUA
                  </h4>
                </div>
                
                {(() => {
                  const activeGroups = selectedList.groups?.map((group: any) => ({
                    category: group.category,
                    items: group.items.filter((item: any) => item.quantity > 0),
                  })).filter((group: any) => group.items.length > 0) || [];

                  if (activeGroups.length === 0) {
                    return (
                      <div className="p-8 text-center text-slate-500 text-sm font-medium">
                        Không có nguyên liệu nào cần mua thêm! 🎉
                      </div>
                    );
                  }

                  return activeGroups.map((group: any, gi: number) => (
                    <div key={gi} className="p-5">
                      <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{group.category}</h5>
                      <div className="space-y-2">
                        {group.items.map((item: any) => (
                          <div
                            key={item.id}
                            className={`flex items-center justify-between py-2 px-3 rounded-brand-sm transition-all ${
                              item.isPurchased ? 'bg-slate-50' : 'hover:bg-brand-primary/5'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => togglePurchased(item.id, item.isPurchased)}
                                className={`w-6 h-6 rounded-brand-sm border flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                                  item.isPurchased
                                    ? 'bg-gradient-to-r from-brand-primary to-brand-secondary border-transparent text-white shadow-brand-glow'
                                    : 'border-slate-300 hover:border-brand-primary hover:bg-brand-primary/5'
                                }`}
                              >
                                {item.isPurchased && <HiCheck className="text-sm" />}
                              </button>
                              <span className={`text-sm ${item.isPurchased ? 'line-through text-slate-400' : 'text-slate-700 font-medium'}`}>
                                {item.ingredient.name}
                              </span>
                            </div>
                            <div className="text-right text-sm">
                              <span className="font-bold text-slate-600">{item.quantity} {item.unit}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Section B: NGUYÊN LIỆU ĐÃ LẤY TỪ TỦ LẠNH */}
              {selectedList.allocations && selectedList.allocations.length > 0 && (
                <div className="divide-y divide-brand-light-border border-t border-brand-light-border">
                  <div className="p-5 bg-blue-50/30 border-b border-blue-100">
                    <h4 className="font-bold text-blue-800 text-sm flex items-center gap-2">
                      <span>❄️</span> NGUYÊN LIỆU ĐÃ LẤY TỪ TỦ LẠNH
                    </h4>
                  </div>
                  <div className="p-5 space-y-3">
                    {selectedList.allocations.map((alloc: any) => (
                      <div key={alloc.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2.5 px-3 bg-slate-50/50 hover:bg-slate-50 border border-slate-100 rounded-brand-sm transition-all gap-1">
                        <div>
                          <span className="text-sm font-semibold text-slate-800">{alloc.ingredientName}</span>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Dành cho: <span className="font-medium text-slate-600">{alloc.destination}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="px-2.5 py-1 rounded-full bg-blue-100/70 text-blue-800 text-xs font-bold">
                            Đã lấy: {alloc.quantity} {alloc.unit}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <MealAIShareSheetModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        shoppingList={selectedList}
        onExportPDF={handleExportPDF}
      />
    </div>
  );
}
