import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { User } from "@support-saas/shared-types";

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  status: "idle",
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ user: User; accessToken: string }>) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.status = "authenticated";
    },
    setAccessToken(state, action: PayloadAction<string>) {
      state.accessToken = action.payload;
      state.status = "authenticated";
    },
    clearCredentials(state) {
      state.user = null;
      state.accessToken = null;
      state.status = "unauthenticated";
    },
    setUnauthenticated(state) {
      state.status = "unauthenticated";
    },
  },
});

export const { setCredentials, setAccessToken, clearCredentials, setUnauthenticated } = authSlice.actions;
export default authSlice.reducer;
