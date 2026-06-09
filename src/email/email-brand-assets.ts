import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Attachment } from 'nodemailer/lib/mailer';

export const INSTITUTIONAL_EMAIL_LOGO_CID = 'brand-logo@cun.edu.co';

let cachedLogoBuffer: Buffer | null | undefined;

function resolveBrandLogoPath(): string | null {
  const candidates = [
    join(__dirname, 'assets', 'brand-logo-email.png'),
    join(__dirname, '..', 'email', 'assets', 'brand-logo-email.png'),
    join(process.cwd(), 'dist', 'email', 'assets', 'brand-logo-email.png'),
    join(process.cwd(), 'src', 'email', 'assets', 'brand-logo-email.png'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function getBrandLogoBuffer(): Buffer | null {
  if (cachedLogoBuffer !== undefined) return cachedLogoBuffer;

  const logoPath = resolveBrandLogoPath();
  if (!logoPath) {
    cachedLogoBuffer = null;
    return null;
  }

  cachedLogoBuffer = readFileSync(logoPath);
  return cachedLogoBuffer;
}

function isPublicHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return false;
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function buildPublicBrandLogoUrl(): string | null {
  const configured = (process.env.EMAIL_BRAND_LOGO_URL ?? '').trim();
  if (configured && isPublicHttpUrl(configured)) return configured;

  const base = (
    process.env.FRONTEND_APP_URL ??
    process.env.APP_PUBLIC_URL ??
    process.env.APP_URL ??
    ''
  )
    .trim()
    .replace(/\/$/, '');

  if (!base) return null;

  const publicUrl = `${base}/brand-logo.png`;
  return isPublicHttpUrl(publicUrl) ? publicUrl : null;
}

/** URL del logo: pública si existe; si no, inline vía CID (sin adjunto visible). */
export function getInstitutionalEmailLogoSrc(): string | null {
  const publicUrl = buildPublicBrandLogoUrl();
  if (publicUrl) return publicUrl;

  if (getBrandLogoBuffer()) return `cid:${INSTITUTIONAL_EMAIL_LOGO_CID}`;
  return null;
}

/** Inline embebido sin filename para que Gmail no lo liste como adjunto. */
export function getInstitutionalEmailLogoAttachment(): Attachment | null {
  if (buildPublicBrandLogoUrl()) return null;

  const content = getBrandLogoBuffer();
  if (!content) return null;

  return {
    content,
    cid: INSTITUTIONAL_EMAIL_LOGO_CID,
    contentDisposition: 'inline',
    contentType: 'image/png',
  };
}

export function enrichInstitutionalEmailPayload(html: string): {
  html: string;
  attachments: Attachment[];
} {
  const cidRef = `cid:${INSTITUTIONAL_EMAIL_LOGO_CID}`;
  if (!html.includes(cidRef)) {
    return { html, attachments: [] };
  }

  const attachment = getInstitutionalEmailLogoAttachment();
  if (!attachment) {
    return { html, attachments: [] };
  }

  return { html, attachments: [attachment] };
}
