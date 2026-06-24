'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { HiCheck, HiShare, HiShoppingCart, HiTrash } from 'react-icons/hi';
import { useAuth } from '@/context/AuthContext';
import api, { shoppingListAPI } from '@/lib/api';
import MealAIShareSheetModal from './MealAIShareSheetModal';

export default function ShoppingListPage() {
  const { user } = useAuth();
  const [lists, setLists] = useState<any[]>([]);
  const [selectedList, setSelectedList] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (user) {
      loadLists();
    } else {
      setLoading(false);
    }
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
      await loadListDetail(selectedList.id);
      await loadLists();
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

  const handleExportPDF = async () => {
    if (!selectedList) {
      toast.error('Chưa chọn danh sách để xuất PDF');
      return;
    }

    const toastId = toast.loading('Đang chuẩn bị file PDF...');
    try {
      const res = await api.get(`/shopping-lists/${selectedList.id}/pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `danh_sach_mua_sam_${selectedList.name.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Đã tải file PDF', { id: toastId });
    } catch {
      toast.error('Có lỗi khi tải file PDF', { id: toastId });
    }
  };

  const renderItemCard = (item: any, canToggle: boolean) => (
    <div
      key={item.id}
      className={`rounded-brand-md border p-3 shadow-brand-sm ${
        item.isPurchased ? 'bg-slate-50 border-slate-200' : 'bg-white border-brand-light-border'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {canToggle && (
              <button
                onClick={() => togglePurchased(item.id, item.isPurchased)}
                className={`w-6 h-6 rounded-brand-sm border flex items-center justify-center transition-all cursor-pointer ${
                  item.isPurchased
                    ? 'bg-gradient-to-r from-brand-primary to-brand-secondary border-transparent text-white'
                    : 'border-slate-300 hover:border-brand-primary hover:bg-brand-primary/5'
                }`}
              >
                {item.isPurchased && <HiCheck className="text-sm" />}
              </button>
            )}
            <span
              className={`text-sm font-semibold ${
                item.isPurchased ? 'line-through text-slate-400' : 'text-slate-800'
              }`}
            >
              {item.ingredient.name}
            </span>
          </div>
          <div className="text-xs text-slate-500 space-y-0.5">
            <p>
              Cần dùng: <strong>{item.requiredQuantity} {item.unit}</strong>
            </p>
            <p>
              Có sẵn: <strong>{item.availableQuantity} {item.unit}</strong>
            </p>
            <p>
              Cần mua: <strong>{item.needToBuyQuantity} {item.unit}</strong>
            </p>
            <p>Ghi chú: {item.note}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="text-sm font-bold text-slate-700">
            {item.needToBuyQuantity} {item.unit}
          </span>
        </div>
      </div>

      {item.allocations?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-dashed border-slate-200 space-y-1">
          <p className="text-[11px] font-bold text-slate-500">Đã trừ từ tủ lạnh</p>
          {item.allocations.map((alloc: any) => (
            <p key={alloc.id} className="text-[11px] text-slate-500">
              {alloc.quantity} {alloc.unit} - {alloc.destination}
            </p>
          ))}
        </div>
      )}
    </div>
  );

  if (!user) {
    return (
      <div className="text-center py-20 bg-brand-light-bg min-h-screen flex flex-col justify-center items-center">
        <p className="text-5xl mb-4 animate-brand-float">🛒</p>
        <p className="text-slate-500">
          Vui lòng{' '}
          <Link
            href="/login"
            className="text-brand-primary font-bold underline hover:text-brand-primary-hover"
          >
            đăng nhập
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-6 bg-brand-light-bg min-h-screen">
      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl font-bold text-slate-900">Danh sách mua sắm</h1>
          <div className="badge-ai">AI tự động</div>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Tự động trừ nguyên liệu còn hạn trong tủ lạnh và chỉ hiển thị phần còn thiếu cần mua
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3">
          <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Danh sách</h2>

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-brand-md border border-brand-light-border h-20 animate-pulse shadow-brand-sm"
                />
              ))}
            </div>
          ) : lists.length === 0 ? (
            <div className="card-dashboard p-8 text-center bg-white">
              <p className="text-sm text-slate-500 font-medium">
                Chưa có danh sách nào. Hãy lên thực đơn tuần trước.
              </p>
              <Link
                href="/meal-planner"
                className="text-sm text-brand-primary font-bold hover:underline mt-2 inline-block"
              >
                Đi tới Thực đơn →
              </Link>
            </div>
          ) : (
            lists.map((list: any) => (
              <button
                key={list.id}
                onClick={() => loadListDetail(list.id)}
                className={`w-full text-left bg-white rounded-brand-md border p-4 transition-all hover:shadow-brand-md cursor-pointer ${
                  selectedList?.id === list.id
                    ? 'border-brand-primary ring-2 ring-brand-primary/10 shadow-brand-glow'
                    : 'border-brand-light-border shadow-brand-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900 text-sm line-clamp-1">{list.name}</p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {list.status}
                  </span>
                </div>
                <div className="mt-3 text-xs text-slate-400 font-medium space-y-1">
                  <p>Cần mua: {list.totalItems} mục</p>
                  <p>Đã có sẵn: {list.inventoryCoveredItems} mục</p>
                  <p>Đã mua: {list.purchasedItems}/{list.totalItems}</p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          {!selectedList ? (
            <div className="card-dashboard p-16 text-center">
              <HiShoppingCart className="text-5xl text-brand-primary/45 mx-auto mb-3 animate-brand-float" />
              <p className="text-slate-500 font-medium">
                Chọn một danh sách ở cột bên trái để xem chi tiết
              </p>
            </div>
          ) : (
            <div className="card-dashboard p-0 divide-y divide-brand-light-border overflow-hidden bg-white">
              <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{selectedList.name}</h3>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="rounded-brand-sm bg-slate-50 border border-slate-200 p-2">
                      <p className="text-slate-400">Tổng nguyên liệu</p>
                      <p className="font-bold text-slate-800">
                        {selectedList.summary?.totalIngredients || 0}
                      </p>
                    </div>
                    <div className="rounded-brand-sm bg-amber-50 border border-amber-200 p-2">
                      <p className="text-amber-700">Cần mua</p>
                      <p className="font-bold text-amber-800">
                        {selectedList.summary?.needToBuyItems || 0}
                      </p>
                    </div>
                    <div className="rounded-brand-sm bg-emerald-50 border border-emerald-200 p-2">
                      <p className="text-emerald-700">Đã có trong tủ lạnh</p>
                      <p className="font-bold text-emerald-800">
                        {selectedList.summary?.alreadyInInventoryItems || 0}
                      </p>
                    </div>
                    <div className="rounded-brand-sm bg-brand-primary/5 border border-brand-primary/10 p-2">
                      <p className="text-brand-primary">Đã tự động trừ</p>
                      <p className="font-bold text-brand-primary">
                        {selectedList.summary?.autoDeductedItems || 0}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShareOpen(true)}
                    className="btn-outline-sm gap-1.5 font-bold text-emerald-600 border-emerald-200 hover:bg-emerald-50"
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

              <div className="p-5 space-y-6">
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-amber-700">Cần mua</span>
                    <span className="text-xs text-slate-400">
                      Chỉ hiển thị phần còn thiếu sau khi đã trừ từ tủ lạnh
                    </span>
                  </div>
                  {selectedList.purchaseGroups?.length ? (
                    selectedList.purchaseGroups.map((group: any) => (
                      <div key={group.category} className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          {group.category}
                        </h4>
                        <div className="space-y-3">
                          {group.items.map((item: any) => renderItemCard(item, true))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-brand-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                      Không có nguyên liệu nào cần mua thêm.
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-emerald-700">Đã có trong tủ lạnh</span>
                    <span className="text-xs text-slate-400">
                      Các nguyên liệu đã đủ, không cần mua thêm
                    </span>
                  </div>
                  {selectedList.inventoryGroups?.length ? (
                    selectedList.inventoryGroups.map((group: any) => (
                      <div key={group.category} className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          {group.category}
                        </h4>
                        <div className="space-y-3">
                          {group.items.map((item: any) => renderItemCard(item, false))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-brand-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      Chưa có mục nào được đáp ứng hoàn toàn từ tủ lạnh.
                    </div>
                  )}
                </section>
              </div>
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
