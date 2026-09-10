import { create } from "zustand";
import type { CartItem } from "@/store/cart";
import { clearRemoteCartDraft } from "@/hooks/useCartDraftSync";

function newLineId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function modifierKey(ids?: string[]) {
  return (ids ?? []).slice().sort().join(",");
}

interface StaffCartStore {
  tableId: string | null;
  customerName: string;
  items: CartItem[];
  setTable: (tableId: string | null) => void;
  setCustomerName: (name: string) => void;
  addItem: (item: Omit<CartItem, "quantity" | "lineId"> & { lineId?: string }) => void;
  removeItem: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  updateNotes: (lineId: string, notes: string) => void;
  clearCart: () => void;
  resetSession: () => void;
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
      // Keep the ticket when first attaching a table so staff can pick items, then a table.
      if (!state.tableId || !tableId) {
        return { ...state, tableId };
      }
      return { tableId, items: [], customerName: "" };
    }),
  setCustomerName: (name) => set({ customerName: name }),
  addItem: (item) => {
    const key = modifierKey(item.modifierOptionIds);
    const existing = get().items.find(
      (i) => i.menuItemId === item.menuItemId && modifierKey(i.modifierOptionIds) === key,
    );
    if (existing) {
      set({
        items: get().items.map((i) =>
          i.lineId === existing.lineId ? { ...i, quantity: i.quantity + 1 } : i,
        ),
      });
    } else {
      set({
        items: [
          ...get().items,
          {
            ...item,
            lineId: item.lineId ?? newLineId(),
            basePrice: item.basePrice ?? item.price,
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
        i.lineId === lineId ? { ...i, notes: notes || undefined } : i,
      ),
    }),
  clearCart: () => set({ items: [], customerName: "" }),
  resetSession: () => set({ tableId: null, customerName: "", items: [] }),
  total: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
  maxPrepTime: () => get().items.reduce((max, i) => Math.max(max, i.prepTimeMinutes), 0),
}));

/** Forget the ticket only when staff close Take Order, refresh, or leave the page. */
export function forgetTakeOrderSession() {
  const tableId = useStaffCartStore.getState().tableId;
  useStaffCartStore.getState().resetSession();
  if (tableId) {
    void clearRemoteCartDraft({ source: "STAFF", tableId });
  }
}
