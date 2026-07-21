"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type ActiveUserState = {
  activeUserId: string | null;
  setActiveUserId: (id: string | null) => void;
};

export const useActiveUserStore = create<ActiveUserState>()(
  persist(
    (set) => ({
      activeUserId: null,
      setActiveUserId: (id) => set({ activeUserId: id }),
    }),
    {
      name: "gbrain-sandbox-active-user",
      partialize: (state) => ({ activeUserId: state.activeUserId }),
    },
  ),
);
