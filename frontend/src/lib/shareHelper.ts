export function formatShoppingListShareText(shoppingList: any): string {
  if (!shoppingList) return '';

  let text = `MealAI - Danh sách mua sắm\n`;
  text += `${shoppingList.name}\n`;

  if (shoppingList.createdAt) {
    const d = new Date(shoppingList.createdAt);
    const hour = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    text += `Tạo lúc: ${hour}:${min} - ${date}/${month}/${year}\n`;
  }

  text += `\nNguyên liệu cần mua:\n`;

  const items: any[] = [];
  shoppingList.groups?.forEach((group: any) => {
    group.items?.forEach((item: any) => {
      items.push(item);
    });
  });

  if (items.length > 0) {
    items.forEach((item: any) => {
      text += `- ${item.ingredient?.name || 'Nguyên liệu'}: ${item.quantity} ${item.unit}\n`;
    });
  } else {
    text += `(Không có nguyên liệu cần mua)\n`;
  }

  if (shoppingList.allocations && shoppingList.allocations.length > 0) {
    text += `\nĐã lấy từ tủ lạnh:\n`;
    shoppingList.allocations.forEach((alloc: any) => {
      text += `- ${alloc.ingredientName}: ${alloc.quantity} ${alloc.unit} cho ${alloc.destination}\n`;
    });
  }

  return text.trim();
}

export function getFilenameDateStr(createdAt: string): string {
  if (!createdAt) return 'list';
  const d = new Date(createdAt);
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${date}-${month}-${year}-${hour}-${min}`;
}

export function downloadTxtFile(filename: string, text: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
