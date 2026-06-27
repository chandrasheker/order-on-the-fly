import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  prepTimeMinutes: number;
  quantity: number;
  notes?: string;
}

interface CartStore {
  customerName: string;
  items: CartItem[];
  setCustomerName: (name: string) => void;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (menuItemId: string) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  updateNotes: (menuItemId: string, notes: string) => void;
  clearCart: () => void;
  total: () => number;
  maxPrepTime: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      customerName: "",
      items: [],
      setCustomerName: (name) => set({ customerName: name }),
      addItem: (item) => {
        const existing = get().items.find((i) => i.menuItemId === item.menuItemId);
        if (existing) {
          set({
            items: get().items.map((i) =>
              i.menuItemId === item.menuItemId
                ? { ...i, quantity: i.quantity + 1 }
                : i
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
            i.menuItemId === menuItemId ? { ...i, quantity } : i
          ),
        });
      },
      updateNotes: (menuItemId, notes) =>
        set({
          items: get().items.map((i) =>
            i.menuItemId === menuItemId ? { ...i, notes } : i
          ),
        }),
      clearCart: () => set({ items: [], customerName: "" }),
      total: () =>
        get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      maxPrepTime: () =>
        get().items.reduce((max, i) => Math.max(max, i.prepTimeMinutes), 0),
    }),
    { name: "tabletap-cart" }
  )
);
