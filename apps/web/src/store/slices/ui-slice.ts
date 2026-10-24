import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface UiState {
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
}

const initialState: UiState = {
  sidebarCollapsed: false,
  commandPaletteOpen: false,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarCollapsed(state, action: PayloadAction<boolean>) {
      state.sidebarCollapsed = action.payload;
    },
    setCommandPaletteOpen(state, action: PayloadAction<boolean>) {
      state.commandPaletteOpen = action.payload;
    },
  },
});

export const { toggleSidebar, setSidebarCollapsed, setCommandPaletteOpen } = uiSlice.actions;
export default uiSlice.reducer;
