import type { NextFunction, Request, RequestHandler, Response } from "express";

// Handlers declare their own params/body/query types, so the request generics must stay open here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AsyncHandler = (req: Request<any, any, any, any>, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
