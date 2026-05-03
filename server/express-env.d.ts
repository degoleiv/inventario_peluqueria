import "express";

declare global {
  namespace Express {
    interface Request {
      user?: { sub: number; email: string; rol: string; permisos: string[] };
    }
  }
}

export {};
