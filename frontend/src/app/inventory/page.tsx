'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { HiClock, HiExclamation, HiPlus, HiSearch, HiTrash } from 'react-icons/hi';
import { useAuth } from '@/context/AuthContext';
import { inventoryAPI } from '@/lib/api';

export default function InventoryPage() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [expandedUsage, setExpandedUsage] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newItem, setNewItem] = useState({
    ingredientId: '',
    ingredientName: '',
    ingredientCategory: '',
    quantity: '',
    unit: '',
    purchaseDate: getTodayInputValue(),
    expirationDate: '',
  });

  useEffect(() => {
    if (user) {
      loadInventory();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadInventory = async () => {
    try {
      const res = await inventoryAPI.getAll();
      const items = res.data.data || [];
      setInventory(items);
      setSummary(res.data.summary || {});
      const existingIds = items.map((i: any) => i.id);
      setSelectedIds((prev) => prev.filter((id) => existingIds.includes(id)));
    } catch {
      console.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const searchIngredients = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 1) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await inventoryAPI.searchIngredients(q);
      setSearchResults(res.data.data || []);
    } catch {
      setSearchResults([]);
    }
  };

  const selectIngredient = (item: any) => {
    const purchaseDate = newItem.purchaseDate || getTodayInputValue();
    const suggestedExpirationDate = suggestExpirationDate(
      item.name,
      item.category,
      purchaseDate,
    );
    setNewItem((prev) => ({
      ...prev,
      ingredientId: item.id,
      ingredientName: item.name,
      ingredientCategory: item.category || '',
      unit: item.defaultUnit || 'g',
      expirationDate: prev.expirationDate || suggestedExpirationDate,
    }));
    setSearchQuery(item.name);
    setSearchResults([]);
  };

  const addItem = async () => {
    const validationError = validateInventoryForm(newItem);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (!newItem.ingredientId || !newItem.quantity) {
      toast.error('Vui lÃ²ng chá»n nguyÃªn liá»‡u vÃ  sá»‘ lÆ°á»£ng');
      return;
    }

    try {
      await inventoryAPI.create({
        ingredientId: newItem.ingredientId,
        quantity: Number(newItem.quantity),
        unit: newItem.unit,
        purchaseDate: newItem.purchaseDate || undefined,
        expirationDate: newItem.expirationDate || undefined,
      });
      toast.success('ÄÃ£ thÃªm vÃ o tá»§ láº¡nh');
      setNewItem({
        ingredientId: '',
        ingredientName: '',
        ingredientCategory: '',
        quantity: '',
        unit: '',
        purchaseDate: getTodayInputValue(),
        expirationDate: '',
      });
      setSearchQuery('');
      setShowAdd(false);
      loadInventory();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ThÃªm tháº¥t báº¡i');
    }
  };

  const removeItem = async (id: string) => {
    if (!confirm('XÃ³a nguyÃªn liá»‡u nÃ y?')) return;
    try {
      await inventoryAPI.remove(id);
      toast.success('ÄÃ£ xÃ³a');
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      loadInventory();
    } catch {
      toast.error('CÃ³ lá»—i xáº£y ra');
    }
  };

  const removeSelectedItems = async () => {
    if (!confirm(`XÃ³a ${selectedIds.length} nguyÃªn liá»‡u Ä‘Ã£ chá»n?`)) return;
    try {
      await Promise.all(selectedIds.map((id) => inventoryAPI.remove(id)));
      toast.success('ÄÃ£ xÃ³a cÃ¡c má»¥c Ä‘Ã£ chá»n');
      setSelectedIds([]);
      loadInventory();
    } catch {
      toast.error('CÃ³ lá»—i xáº£y ra khi xÃ³a');
    }
  };

  const toggleUsage = (id: string) => {
    setExpandedUsage((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const updatePurchaseDate = (purchaseDate: string) => {
    setNewItem((prev) => {
      const previousSuggestion = suggestExpirationDate(
        prev.ingredientName,
        prev.ingredientCategory,
        prev.purchaseDate || getTodayInputValue(),
      );
      const shouldUpdateExpiration =
        !prev.expirationDate || prev.expirationDate === previousSuggestion;

      return {
        ...prev,
        purchaseDate,
        expirationDate: shouldUpdateExpiration
          ? suggestExpirationDate(prev.ingredientName, prev.ingredientCategory, purchaseDate)
          : prev.expirationDate,
      };
    });
  };

  const getUrgencyStyle = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return 'bg-brand-danger/10 text-brand-danger border-brand-danger/25';
      case 'high':
      case 'medium':
        return 'bg-brand-warning/10 text-brand-warning border-brand-warning/25';
      case 'low':
        return 'bg-slate-100 text-slate-500 border-slate-200';
      case 'no_expiry':
        return 'bg-slate-100 text-slate-500 border-slate-200';
      default:
        return 'bg-brand-primary/10 text-brand-primary border-brand-primary/25';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'expired':
        return 'ÄÃ£ háº¿t háº¡n';
      case 'near_expiry':
        return 'Sáº¯p háº¿t háº¡n';
      case 'used_up':
        return 'ÄÃ£ dÃ¹ng háº¿t';
      case 'no_expiry':
        return 'ChÆ°a cÃ³ háº¡n dÃ¹ng';
      default:
        return 'CÃ²n háº¡n';
    }
  };

  if (!user) {
    return (
      <div className="text-center py-20 bg-brand-light-bg min-h-screen flex flex-col justify-center items-center">
        <p className="text-5xl mb-4 animate-brand-float">ðŸ§Š</p>
        <p className="text-slate-500">
          Vui lÃ²ng{' '}
          <Link
            href="/login"
            className="text-brand-primary font-bold underline hover:text-brand-primary-hover"
          >
            Ä‘Äƒng nháº­p
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 py-6 bg-brand-light-bg min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tá»§ láº¡nh cá»§a tÃ´i</h1>
          <p className="text-sm text-slate-500 mt-1">
            Theo dÃµi tá»“n kho, háº¡n dÃ¹ng vÃ  lá»‹ch sá»­ Ä‘Ã£ dÃ¹ng cho tá»«ng nguyÃªn liá»‡u
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="btn-primary w-full sm:w-auto justify-center"
        >
          <HiPlus /> ThÃªm nguyÃªn liá»‡u
        </button>
      </div>

      {(summary.expired > 0 || summary.nearExpiry > 0) && (
        <div className="card-ai-warning p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="badge-ai">AI cáº£nh bÃ¡o</div>
            <HiExclamation className="text-xl text-brand-warning animate-pulse" />
            <div className="flex flex-wrap gap-2">
              {summary.expired > 0 && (
                <span className="px-2.5 py-1 bg-brand-danger/10 text-brand-danger border border-brand-danger/20 rounded-brand-sm text-xs font-semibold">
                  {summary.expired} nguyÃªn liá»‡u Ä‘Ã£ háº¿t háº¡n
                </span>
              )}
              {summary.nearExpiry > 0 && (
                <span className="px-2.5 py-1 bg-brand-warning/10 text-brand-warning border border-brand-warning/20 rounded-brand-sm text-xs font-semibold">
                  {summary.nearExpiry} nguyÃªn liá»‡u sáº¯p háº¿t háº¡n
                </span>
              )}
            </div>
          </div>
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">
            Æ¯u tiÃªn dÃ¹ng cÃ¡c lÃ´ gáº§n háº¿t háº¡n trÆ°á»›c
          </span>
        </div>
      )}

      {showAdd && (
        <div className="card-dashboard space-y-4">
          <h3 className="font-bold text-slate-900 text-base">ThÃªm nguyÃªn liá»‡u má»›i</h3>

          <div className="relative">
            <HiSearch className="absolute left-3 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="TÃ¬m nguyÃªn liá»‡u"
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
                    {item.name}{' '}
                    <span className="text-slate-400 text-xs font-normal">({item.category})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-500">Sá»‘ lÆ°á»£ng</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Sá»‘ lÆ°á»£ng"
                value={newItem.quantity}
                onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                className="px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-500">ÄÆ¡n vá»‹</span>
              <input
                type="text"
                placeholder="g, kg, quáº£..."
                value={newItem.unit}
                onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                className="px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-500">NgÃ y mua</span>
              <input
                type="date"
                placeholder="Chá»n ngÃ y mua"
                value={newItem.purchaseDate}
                max={getTodayInputValue()}
                onChange={(e) => updatePurchaseDate(e.target.value)}
                className="px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-500">Háº¡n sá»­ dá»¥ng</span>
              <input
                type="date"
                placeholder="Chá»n háº¡n sá»­ dá»¥ng"
                value={newItem.expirationDate}
                min={newItem.purchaseDate || getTodayInputValue()}
                onChange={(e) => setNewItem({ ...newItem, expirationDate: e.target.value })}
                className="px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
              />
              <span className="text-[11px] text-slate-400">
                {newItem.expirationDate
                  ? `Gá»£i Ã½/Ä‘Ã£ chá»n: ${formatDateVN(newItem.expirationDate)}`
                  : 'ChÆ°a thiáº¿t láº­p háº¡n sá»­ dá»¥ng'}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            NÃªn nháº­p háº¡n sá»­ dá»¥ng Ä‘á»ƒ MealAI Æ°u tiÃªn dÃ¹ng nguyÃªn liá»‡u gáº§n háº¿t háº¡n vÃ  giáº£m lÃ£ng phÃ­.
          </p>

          <button onClick={addItem} className="btn-primary">
            ThÃªm vÃ o tá»§ láº¡nh
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-brand-lg border border-brand-light-border h-20 animate-pulse shadow-brand-sm"
            />
          ))}
        </div>
      ) : inventory.length === 0 ? (
        <div className="card-dashboard p-16 text-center">
          <p className="text-5xl mb-4 animate-brand-float">ðŸ§Š</p>
          <p className="text-slate-500 font-medium">
            Tá»§ láº¡nh trá»‘ng. ThÃªm nguyÃªn liá»‡u Ä‘á»ƒ báº¯t Ä‘áº§u nhÃ©.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Bulk Selection Bar */}
          <div className="flex items-center justify-between bg-white border border-brand-light-border rounded-brand-md p-4 shadow-brand-sm">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedIds.length === inventory.length && inventory.length > 0}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedIds(inventory.map((item) => item.id));
                  } else {
                    setSelectedIds([]);
                  }
                }}
                className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
              />
              <span className="text-sm font-semibold text-slate-700 select-none">Chá»n táº¥t cáº£</span>
            </div>
            {selectedIds.length > 0 && (
              <button
                onClick={removeSelectedItems}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-brand-md text-xs font-bold hover:bg-red-700 shadow-brand-sm transition cursor-pointer"
              >
                <HiTrash className="text-base" />
                <span>XÃ³a má»¥c Ä‘Ã£ chá»n ({selectedIds.length})</span>
              </button>
            )}
          </div>

          <div className="card-dashboard p-0 divide-y divide-brand-light-border overflow-hidden bg-white">
            {inventory.map((item: any) => (
              <div key={item.id} className="transition-all divide-y divide-brand-light-border/40">
                <div className="flex items-center justify-between px-5 py-4 hover:bg-slate-50/30 transition-all">
                  <div className="flex items-start gap-4">
                    {/* Item checkbox */}
                    <div className="pt-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds((prev) => [...prev, item.id]);
                          } else {
                            setSelectedIds((prev) => prev.filter((id) => id !== item.id));
                          }
                        }}
                        className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                    </div>

                    <div className="w-10 h-10 bg-brand-primary/10 rounded-brand-sm flex items-center justify-center text-lg select-none shrink-0">
                      ðŸ¥¬
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-800 text-sm">{item.ingredient.name}</p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-slate-500">
                        <span>
                          Tá»“n kho ban Ä‘áº§u:{' '}
                          <strong className="text-slate-700">
                            {item.initialQuantity} {item.unit}
                          </strong>
                        </span>
                        <span>â€¢</span>
                        <span>
                          ÄÃ£ dÃ¹ng:{' '}
                          <strong className="text-amber-600">
                            {item.usedQuantity} {item.unit}
                          </strong>
                        </span>
                        <span>â€¢</span>
                        <span>
                          CÃ²n láº¡i:{' '}
                          <strong className="text-brand-success">
                            {item.remainingQuantity} {item.unit}
                          </strong>
                        </span>
                        <span>â€¢</span>
                        <span>Tráº¡ng thÃ¡i: {getStatusLabel(item.status)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                        <span>
                          NgÃ y mua:{' '}
                          {item.purchaseDate
                            ? formatDateVN(item.purchaseDate)
                            : '--'}
                        </span>
                        <span>â€¢</span>
                        <span>
                          Háº¡n dÃ¹ng:{' '}
                          {item.expirationDate
                            ? formatDateVN(item.expirationDate)
                            : 'ChÆ°a thiáº¿t láº­p háº¡n sá»­ dá»¥ng'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {item.usageHistory?.length > 0 && (
                      <button
                        onClick={() => toggleUsage(item.id)}
                        className="px-2.5 py-1 rounded-brand-sm text-[11px] font-bold border border-brand-secondary/20 bg-brand-secondary/5 text-brand-secondary hover:bg-brand-secondary/15 transition-all cursor-pointer"
                      >
                        {expandedUsage[item.id] ? 'Thu gá»n' : 'Chi tiáº¿t dÃ¹ng'}
                      </button>
                    )}
                    <span className="px-2.5 py-1 rounded-brand-sm text-[11px] font-semibold border border-slate-200 text-slate-600 bg-slate-50">
                      {getStatusLabel(item.status)}
                    </span>
                    {item.urgency && item.urgency !== 'none' && item.daysLeft !== null && (
                      <span
                        className={`px-2.5 py-1 rounded-brand-sm text-[11px] font-semibold border flex items-center gap-1 ${getUrgencyStyle(item.urgency)}`}
                      >
                        <HiClock />
                        {item.daysLeft} ngÃ y
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

                {item.usageHistory?.length > 0 && expandedUsage[item.id] && (
                  <div className="px-5 pb-4 pt-3 bg-slate-50/50 animate-fade-in space-y-2 text-xs">
                    <div className="text-[11px] font-bold text-slate-700">Lá»‹ch sá»­ sá»­ dá»¥ng</div>
                    <div className="space-y-2 bg-white p-3 rounded border border-brand-light-border shadow-brand-sm">
                      {item.usageHistory.map((usage: any) => (
                        <div
                          key={usage.id}
                          className="rounded-brand-sm border border-slate-100 p-2.5 bg-slate-50/60"
                        >
                          <p className="text-slate-700 font-semibold">
                            DÃ¹ng {usage.quantityAllocated ?? usage.usedQuantity} {usage.unit}
                          </p>
                          <p className="text-slate-500 mt-1">
                            {usage.reason || 'ÄÃ£ tá»± Ä‘á»™ng trá»« tá»« tá»§ láº¡nh'}
                          </p>
                          <div className="mt-2 grid gap-1 text-slate-500 sm:grid-cols-2">
                            <p>
                              <span className="font-semibold text-slate-600">MÃ³n:</span>{' '}
                              {usage.recipeName || 'ChÆ°a xÃ¡c Ä‘á»‹nh mÃ³n'}
                            </p>
                            <p>
                              <span className="font-semibold text-slate-600">Bá»¯a:</span>{' '}
                              {getShortMealLabel(usage.mealType, usage.mealTypeLabel)}
                            </p>
                            <p>
                              <span className="font-semibold text-slate-600">NgÃ y dÃ¹ng:</span>{' '}
                              {formatUsageDate(usage.mealDate || usage.createdAt)}
                            </p>
                            <p>
                              <span className="font-semibold text-slate-600">Danh sÃ¡ch:</span>{' '}
                              {usage.shoppingListName || 'ChÆ°a xÃ¡c Ä‘á»‹nh danh sÃ¡ch'}
                            </p>
                          </div>
                        </div>
                      ))}
                      <p className="text-slate-500 pt-1.5 border-t border-dashed border-slate-200 mt-1.5">
                        CÃ²n láº¡i kháº£ dá»¥ng:{' '}
                        <strong className="text-brand-success">
                          {item.remainingQuantity} {item.unit}
                        </strong>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getTodayInputValue() {
  return formatDateInput(new Date());
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateVN(value: string | Date) {
  const date = value instanceof Date ? value : parseDateInput(String(value).slice(0, 10));
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function formatUsageDate(value?: string | Date | null) {
  if (!value) return 'ChÆ°a xÃ¡c Ä‘á»‹nh ngÃ y';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return formatDateVN(raw.slice(0, 10));
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'ChÆ°a xÃ¡c Ä‘á»‹nh ngÃ y';
  return date.toLocaleDateString('vi-VN');
}

function getShortMealLabel(mealType?: string | null, mealTypeLabel?: string | null) {
  const labels: Record<string, string> = {
    breakfast: 'SÃ¡ng',
    lunch: 'TrÆ°a',
    dinner: 'Tá»‘i',
  };
  if (mealType && labels[mealType]) return labels[mealType];
  if (mealTypeLabel) return mealTypeLabel.replace(/^Bá»¯a\s+/i, '');
  return 'ChÆ°a xÃ¡c Ä‘á»‹nh bá»¯a';
}

function addDaysToInputDate(dateString: string, days: number) {
  const date = parseDateInput(dateString || getTodayInputValue());
  date.setDate(date.getDate() + days);
  return formatDateInput(date);
}

function suggestExpirationDate(name: string, category: string, purchaseDate: string) {
  const days = getSuggestedShelfLifeDays(name, category);
  if (!days) return '';
  return addDaysToInputDate(purchaseDate || getTodayInputValue(), days);
}

function getSuggestedShelfLifeDays(name: string, category: string) {
  const text = `${name} ${category}`.toLowerCase();

  if (/(cÃ¡|ca |tÃ´m|tom|má»±c|muc|háº£i sáº£n|hai san|seafood)/.test(text)) return 2;
  if (/(thá»‹t|thit|bÃ²|bo |heo|gÃ |ga |chicken|beef|pork)/.test(text)) return 3;
  if (/(rau|xÃ  lÃ¡ch|xa lach|cáº£i|cai|hÃ nh|hanh|ngÃ²|ngo)/.test(text)) return 4;
  if (/(cá»§|cu |quáº£|qua |khoai|cÃ  rá»‘t|ca rot|bÃ­|bi |báº§u|bau)/.test(text)) return 7;
  if (/(trá»©ng|trung|egg)/.test(text)) return 21;
  if (/(sá»¯a|sua|milk|yogurt|sá»¯a chua|sua chua)/.test(text)) return 7;
  if (/(gia vá»‹|gia vi|muá»‘i|muoi|Ä‘Æ°á»ng|duong|tiÃªu|tieu|bá»™t|bot|nÆ°á»›c máº¯m|nuoc mam|xÃ¬ dáº§u|xi dau)/.test(text)) return 90;
  if (/(gáº¡o|gao|bÃºn khÃ´|bun kho|mÃ¬ khÃ´|mi kho|má»³ khÃ´|my kho|pasta|noodle)/.test(text)) return 90;

  return 7;
}

function validateInventoryForm(item: {
  ingredientId: string;
  quantity: string;
  unit: string;
  purchaseDate: string;
  expirationDate: string;
}) {
  if (!item.ingredientId) return 'TÃªn nguyÃªn liá»‡u khÃ´ng Ä‘Æ°á»£c trá»‘ng.';
  if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
    return 'Sá»‘ lÆ°á»£ng pháº£i lá»›n hÆ¡n 0.';
  }
  if (!item.unit.trim()) return 'ÄÆ¡n vá»‹ khÃ´ng Ä‘Æ°á»£c trá»‘ng.';

  const today = getTodayInputValue();
  const purchaseDate = item.purchaseDate || today;
  if (purchaseDate > today) return 'NgÃ y mua khÃ´ng Ä‘Æ°á»£c lá»›n hÆ¡n ngÃ y hiá»‡n táº¡i.';
  if (item.expirationDate && item.expirationDate < purchaseDate) {
    return 'Háº¡n sá»­ dá»¥ng khÃ´ng Ä‘Æ°á»£c nhá» hÆ¡n ngÃ y mua.';
  }

  return '';
}
