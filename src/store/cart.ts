import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  lineId: string;
  menuItemId: string;
  name: string;
  price: number;
  basePrice: number;
  prepTimeMinutes: number;
  quantity: number;
  notes?: string;
  modifierOptionIds?: string[];
  modifierLabels?: string;
}

function newLineId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function modifierKey(ids?: string[]) {
  return (ids ?? []).slice().sort().join(",");
}

interface CartStore {
  customerName: string;
  promoCode: string;
  items: CartItem[];
  setCustomerName: (name: string) => void;
  setPromoCode: (code: string) => void;
  addItem: (item: Omit<CartItem, "quantity" | "lineId"> & { lineId?: string }) => void;
  removeItem: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  updateNotes: (lineId: string, notes: string) => void;
  clearCart: () => void;
  total: () => number;
  maxPrepTime: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      customerName: "",
      promoCode: "",
      items: [],
      setCustomerName: (name) => set({ customerName: name }),
      setPromoCode: (code) => set({ promoCode: code.trim().toUpperCase() }),
      addItem: (item) => {
        const key = modifierKey(item.modifierOptionIds);
        const existing = get().items.find(
          (i) =>
            i.menuItemId === item.menuItemId && modifierKey(i.modifierOptionIds) === key,
        );
        if (existing) {
          set({
            items: get().items.map((i) =>
              i.lineId === existing.lineId
                ? { ...i, quantity: i.quantity + 1 }
                : i,
            ),
          });
        } else {
          set({
            items: [
              ...get().items,
              {
                ...item,
                lineId: item.lineId ?? newLineId(),
                quantity: 1,
              },
            ],
          });
        }
      },
      removeItem: (lineId) =>
        set({ items: get().items.filter((i) => i.lineId !== lineId) }),
      updateQuantity: (lineId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(lineId);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.lineId === lineId ? { ...i, quantity } : i,
          ),
        });
      },
      updateNotes: (lineId, notes) =>
        set({
          items: get().items.map((i) =>
            i.lineId === lineId ? { ...i, notes } : i,
          ),
        }),
      clearCart: () => set({ items: [], customerName: "", promoCode: "" }),
      total: () =>
        get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      maxPrepTime: () =>
        get().items.reduce((max, i) => Math.max(max, i.prepTimeMinutes), 0),
    }),
    { name: "tabletap-cart" },
  ),
);
