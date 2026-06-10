'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { inventoryAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { HiPlus, HiTrash, HiSearch, HiExclamation, HiClock } from 'react-icons/hi';

export default function InventoryPage() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Add form state
  const [newItem, setNewItem] = useState({
    ingredientId: '', ingredientName: '', quantity: '', unit: '', expirationDate: '',
  });

  useEffect(() => {
    if (user) loadInventory();
    else setLoading(false);
  }, [user]);

  const loadInventory = async () => {
    try {
      const res = await inventoryAPI.getAll();
      setInventory(res.data.data || []);
      setSummary(res.data.summary || {});
    } catch {
      console.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const searchIngredients = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 1) { setSearchResults([]); return; }
    try {
      const res = await inventoryAPI.searchIngredients(q);
      setSearchResults(res.data.data || []);
    } catch { /* ignore */ }
  };

  const selectIngredient = (item: any) => {
    setNewItem({ ...newItem, ingredientId: item.id, ingredientName: item.name, unit: item.defaultUnit || 'g' });
    setSearchQuery(item.name);
    setSearchResults([]);
  };

  const addItem = async () => {
    if (!newItem.ingredientId || !newItem.quantity) {
      toast.error('Vui lòng chọn nguyên liệu và số lượng');
      return;
    }
    try {
      await inventoryAPI.create({
        ingredientId: newItem.ingredientId,
        quantity: Number(newItem.quantity),
        unit: newItem.unit,
        expirationDate: newItem.expirationDate || undefined,
      });
      toast.success('Đã thêm vào tủ lạnh!');
      setShowAdd(false);
      setNewItem({ ingredientId: '', ingredientName: '', quantity: '', unit: '', expirationDate: '' });
      setSearchQuery('');
      loadInventory();
    } catch {
      toast.error('Thêm thất bại');
    }
  };

  const removeItem = async (id: string) => {
    if (!confirm('Xóa nguyên liệu này?')) return;
    try {
      await inventoryAPI.remove(id);
      toast.success('Đã xóa');
      loadInventory();
    } catch {
      toast.error('Có lỗi xảy ra');
    }
  };

  const getUrgencyStyle = (urgency: string) => {
    switch (urgency) {
      case 'critical': 
        return 'bg-brand-danger/10 text-brand-danger border-brand-danger/25';
      case 'high': 
      case 'medium': 
        return 'bg-brand-warning/10 text-brand-warning border-brand-warning/25';
      case 'low':
      default: 
        return 'bg-brand-primary/10 text-brand-primary border-brand-primary/25';
    }
  };

  if (!user) {
    return (
      <div className="text-center py-20 bg-brand-light-bg min-h-screen flex flex-col justify-center items-center">
        <p className="text-5xl mb-4 animate-brand-float">🧊</p>
        <p className="text-slate-500">Vui lòng <Link href="/login" className="text-brand-primary font-bold underline hover:text-brand-primary-hover">đăng nhập</Link></p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 py-6 bg-brand-light-bg min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tủ lạnh của tôi 🧊</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý nguyên liệu và hạn sử dụng</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="btn-primary"
        >
          <HiPlus /> Thêm nguyên liệu
        </button>
      </div>

      {/* Urgency Summary */}
      {(summary.critical > 0 || summary.high > 0) && (
        <div className="card-ai-warning p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="badge-ai">🤖 AI Cảnh báo</div>
            <HiExclamation className="text-xl text-brand-warning animate-pulse" />
            <div className="flex flex-wrap gap-2">
              {summary.critical > 0 && (
                <span className="px-2.5 py-1 bg-brand-danger/10 text-brand-danger border border-brand-danger/20 rounded-brand-sm text-xs font-semibold">
                  🔴 {summary.critical} nguyên liệu sắp hết hạn
                </span>
              )}
              {summary.high > 0 && (
                <span className="px-2.5 py-1 bg-brand-warning/10 text-brand-warning border border-brand-warning/20 rounded-brand-sm text-xs font-semibold">
                  🟠 {summary.high} cần dùng sớm
                </span>
              )}
            </div>
          </div>
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">Phân tích hạn dùng thông minh</span>
        </div>
      )}

      {/* Add Item Form */}
      {showAdd && (
        <div className="card-dashboard space-y-4">
          <h3 className="font-bold text-slate-900 text-base">Thêm nguyên liệu mới</h3>

          <div className="relative">
            <HiSearch className="absolute left-3 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm nguyên liệu (VD: Thịt heo, Rau muống...)"
              value={searchQuery}
              onChange={(e) => searchIngredients(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-brand-light-border rounded-brand-sm bg-white focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none transition text-sm shadow-brand-sm"
            />
            {searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-brand-light-border rounded-brand-sm shadow-brand-lg max-h-40 overflow-auto">
                {searchResults.map((item: any) => (
                  <button
                    key={item.id}
                    onClick={() => selectIngredient(item)}
                    className="w-full text-left px-4 py-2 hover:bg-brand-primary/10 text-sm font-medium transition cursor-pointer"
                  >
                    {item.name} <span className="text-slate-400 text-xs font-normal">({item.category})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-500">Số lượng</span>
              <input
                type="number"
                placeholder="Số lượng"
                value={newItem.quantity}
                onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                className="px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-500">Đơn vị</span>
              <input
                type="text"
                placeholder="Đơn vị (g, kg, quả...)"
                value={newItem.unit}
                onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                className="px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-500">Hạn sử dụng</span>
              <input
                type="date"
                value={newItem.expirationDate}
                onChange={(e) => setNewItem({ ...newItem, expirationDate: e.target.value })}
                className="px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
              />
            </div>
          </div>

          <button
            onClick={addItem}
            className="btn-primary"
          >
            Thêm vào tủ lạnh
          </button>
        </div>
      )}

      {/* Inventory List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="bg-white rounded-brand-lg border border-brand-light-border h-20 animate-pulse shadow-brand-sm" />)}
        </div>
      ) : inventory.length === 0 ? (
        <div className="card-dashboard p-16 text-center">
          <p className="text-5xl mb-4 animate-brand-float">🧊</p>
          <p className="text-slate-500 font-medium">Tủ lạnh trống. Thêm nguyên liệu để bắt đầu nấu ăn thôi nào!</p>
        </div>
      ) : (
        <div className="card-dashboard p-0 divide-y divide-brand-light-border overflow-hidden">
          {inventory.map((item: any) => (
            <div key={item.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-brand-primary/10 rounded-brand-sm flex items-center justify-center text-lg select-none">
                  🥬
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{item.ingredient.name}</p>
                  <p className="text-xs text-slate-400 font-medium">{item.quantity} {item.unit}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {item.urgency && item.urgency !== 'none' && (
                  <span className={`px-2.5 py-1 rounded-brand-sm text-xs font-semibold border flex items-center gap-1 ${getUrgencyStyle(item.urgency)}`}>
                    <HiClock />
                    {item.daysLeft} ngày
                  </span>
                )}
                <button
                  onClick={() => removeItem(item.id)}
                  className="p-2 text-slate-400 hover:text-brand-danger hover:scale-[1.05] transition-all cursor-pointer"
                >
                  <HiTrash className="text-base" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
