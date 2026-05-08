import nodemailer from "nodemailer";
import { db } from "../db.js";
import { AppError } from "../lib/AppError.js";

const SMTP_KEYS = {
  host: "smtp_host",
  port: "smtp_port",
  secure: "smtp_secure",
  user: "smtp_user",
  from: "smtp_from",
} as const;

async function getValor(clave: string): Promise<string | null> {
  const row = (await db.prepare(`SELECT valor FROM configuracion WHERE clave = ?`).get(clave)) as
    | { valor: string }
    | undefined;
  return row?.valor ?? null;
}

async function setValor(clave: string, valor: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
    )
    .run(clave, valor);
}

export type ResolvedSmtp = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

function parseBoolEnv(v: string | undefined): boolean | undefined {
  if (v == null || v === "") return undefined;
  const t = v.trim().toLowerCase();
  if (t === "1" || t === "true" || t === "yes") return true;
  if (t === "0" || t === "false" || t === "no") return false;
  return undefined;
}

/** Configuración efectiva: variables de entorno tienen prioridad sobre la tabla `configuracion`. */
export async function resolveSmtp(): Promise<ResolvedSmtp | null> {
  const host = (process.env.SMTP_HOST || (await getValor(SMTP_KEYS.host)) || "").trim();
  const portRaw = process.env.SMTP_PORT?.trim() || (await getValor(SMTP_KEYS.port))?.trim() || "587";
  const port = Number(portRaw);
  const portN = Number.isFinite(port) && port > 0 ? port : 587;

  const secureEnv = parseBoolEnv(process.env.SMTP_SECURE);
  const secureDb = await getValor(SMTP_KEYS.secure);
  let secure: boolean;
  if (secureEnv !== undefined) secure = secureEnv;
  else if (secureDb === "1" || secureDb === "true") secure = true;
  else if (secureDb === "0" || secureDb === "false") secure = false;
  else secure = portN === 465;

  const user = (process.env.SMTP_USER?.trim() || (await getValor(SMTP_KEYS.user))?.trim() || "").trim();
  const pass = (process.env.SMTP_PASSWORD?.trim() || process.env.SMTP_PASS?.trim() || "").trim();
  const fromEnv = process.env.SMTP_FROM?.trim();
  const fromDb = (await getValor(SMTP_KEYS.from))?.trim();
  const from = (fromEnv || fromDb || user || "").trim();

  if (!host || !from) return null;
  return { host, port: portN, secure, user, pass, from };
}

async function requireSmtp(): Promise<ResolvedSmtp> {
  const c = await resolveSmtp();
  if (!c) {
    throw new AppError(
      "SMTP no configurado: definí SMTP_HOST y SMTP_FROM (y credenciales SMTP_PASSWORD / SMTP_USER si tu servidor lo exige). Opcionalmente podés guardar host/puerto en Configuración.",
      503
    );
  }
  return c;
}

export const smtpService = {
  async isReady(): Promise<boolean> {
    return (await resolveSmtp()) != null;
  },

  async getPublicConfig(): Promise<{
    configured: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from: string;
    password_set_via_env: boolean;
  }> {
    const c = await resolveSmtp();
    const password_set_via_env = !!(
      process.env.SMTP_PASSWORD?.trim() || process.env.SMTP_PASS?.trim()
    );
    if (!c) {
      return {
        configured: false,
        host: "",
        port: 587,
        secure: false,
        user: "",
        from: "",
        password_set_via_env,
      };
    }
    return {
      configured: true,
      host: c.host,
      port: c.port,
      secure: c.secure,
      user: c.user,
      from: c.from,
      password_set_via_env,
    };
  },

  async updateStoredConfig(body: Record<string, unknown>) {
    if (typeof body.host === "string") await setValor(SMTP_KEYS.host, body.host.trim());
    if (body.port != null) {
      const n = Number(body.port);
      if (!Number.isFinite(n) || n <= 0 || n > 65535) {
        throw new AppError("smtp port inválido");
      }
      await setValor(SMTP_KEYS.port, String(Math.floor(n)));
    }
    if (typeof body.secure === "boolean") await setValor(SMTP_KEYS.secure, body.secure ? "1" : "0");
    if (typeof body.user === "string") await setValor(SMTP_KEYS.user, body.user.trim());
    if (typeof body.from === "string") await setValor(SMTP_KEYS.from, body.from.trim());
    return await smtpService.getPublicConfig();
  },

  async verifyConnection(): Promise<void> {
    const c = await requireSmtp();
    const transporter = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      auth: c.user || c.pass ? { user: c.user, pass: c.pass } : undefined,
    });
    await transporter.verify();
  },

  async sendMail(opts: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    attachments?: Array<{ filename: string; content: string | Buffer; contentType?: string }>;
  }): Promise<void> {
    const c = await requireSmtp();
    const transporter = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      auth: c.user || c.pass ? { user: c.user, pass: c.pass } : undefined,
    });
    try {
      await transporter.sendMail({
        from: c.from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
        attachments: opts.attachments,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al enviar correo";
      throw new AppError(`Fallo SMTP: ${msg}`, 502);
    }
  },

  async sendTestEmail(to: string): Promise<void> {
    const t = to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
      throw new AppError("Email de destino inválido", 400);
    }
    await smtpService.sendMail({
      to: t,
      subject: "Prueba SMTP — inventario peluquería",
      text: "Si recibís este mensaje, la configuración SMTP es correcta.",
      html: "<p>Si recibís este mensaje, la configuración <strong>SMTP</strong> es correcta.</p>",
    });
  },
};
