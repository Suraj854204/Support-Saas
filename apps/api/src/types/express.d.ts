import type { UserRole } from "@support-saas/shared-types";

export interface AuthContext {
  userId: string;
  orgId: string;
  role: UserRole;
}

export interface WidgetAuthContext {
  customerId: string;
  orgId: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      widgetAuth?: WidgetAuthContext;
    }
  }
}

export {};
