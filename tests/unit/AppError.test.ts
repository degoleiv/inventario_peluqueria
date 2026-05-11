import { describe, it, expect } from "vitest";
import { AppError } from "../../server/lib/AppError.js";

describe("AppError (caja blanca)", () => {
  it("status por defecto = 400", () => {
    const e = new AppError("oops");
    expect(e.status).toBe(400);
    expect(e.message).toBe("oops");
    expect(e.name).toBe("AppError");
    expect(e).toBeInstanceOf(Error);
  });

  it("permite status y code personalizados", () => {
    const e = new AppError("forbidden", 403, "FORBID");
    expect(e.status).toBe(403);
    expect(e.code).toBe("FORBID");
  });

  it("conserva la traza para detectar instanceof", () => {
    try {
      throw new AppError("x", 404);
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(404);
    }
  });
});
