import { Request } from "express";

export type AuthUser = {
  userId: string;
  openid: string;
};

export type RequestWithAuthUser = Request & {
  traceId?: string;
  user?: AuthUser;
};
