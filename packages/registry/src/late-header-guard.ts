import type { NextFunction, Request, Response } from "express";

const TARBALL_PATH = /\/-\/[^/]+\.tgz$/;

// @verdaccio/local-storage before 14.0.0-next-9.33 emits a tarball's size after
// piping starts; setting content-length then throws and kills the process
export function ignoreLateContentLength(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (TARBALL_PATH.test(req.path)) {
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name, value) =>
      res.headersSent && name.toLowerCase() === "content-length"
        ? res
        : setHeader(name, value);
  }
  next();
}
