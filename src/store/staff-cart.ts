import { create } from "zustand";
import type { CartItem } from "@/store/cart";

interface StaffCartStore {
  tableId: string | null;
  customerName: string;
  items: CartItem[];
  setTable: (tableId: string | null) => void;
  setCustomerName: (name: string) => void;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (menuItemId: string) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  updateNotes: (menuItemId: string, notes: string) => void;
  clearCart: () => void;
  total: () => number;
  maxPrepTime: () => number;
}

export const useStaffCartStore = create<StaffCartStore>((set, get) => ({
  tableId: null,
  customerName: "",
  items: [],
  setTable: (tableId) =>
    set((state) => {
      if (state.tableId === tableId) return state;
      return { tableId, items: [], customerName: "" };
    }),
  setCustomerName: (name) => set({ customerName: name }),
  addItem: (item) => {
    const existing = get().items.find((i) => i.menuItemId === item.menuItemId);
    if (existing) {
      set({
        items: get().items.map((i) =>
          i.menuItemId === item.menuItemId ? { ...i, quantity: i.quantity + 1 } : i,
        ),
      });
    } else {
      set({ items: [...get().items, { ...item, quantity: 1 }] });
    }
  },
  removeItem: (menuItemId) =>
    set({ items: get().items.filter((i) => i.menuItemId !== menuItemId) }),
  updateQuantity: (menuItemId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(menuItemId);
      return;
    }
    set({
      items: get().items.map((i) =>
        i.menuItemId === menuItemId ? { ...i, quantity } : i,
      ),
    });
  },
  updateNotes: (menuItemId, notes) =>
    set({
      items: get().items.map((i) =>
        i.menuItemId === menuItemId ? { ...i, notes: notes || undefined } : i,
      ),
    }),
  clearCart: () => set({ items: [], customerName: "" }),
  total: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
  maxPrepTime: () => get().items.reduce((max, i) => Math.max(max, i.prepTimeMinutes), 0),
}));
