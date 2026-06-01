export const INSTITUTIONAL_BRAND = {
  orange: '#E87722',
  orangeDark: '#C9621A',
  navy: '#1B2A4A',
  text: '#1F2937',
  textMuted: '#6B7280',
  textLight: '#9CA3AF',
  bg: '#F3F4F6',
  card: '#FAFAFA',
  white: '#FFFFFF',
  divider: '#E5E7EB',
  border: '#E5E7EB',
} as const;

export interface InstitutionalHighlight {
  label: string;
  value: string;
}

export interface InstitutionalSection {
  title: string;
  html: string;
  text: string;
}

export interface InstitutionalEmailLayoutInput {
  title: string;
  eventLabel?: string;
  intro?: string;
  highlights?: InstitutionalHighlight[];
  summaryLines?: string[];
  sections?: InstitutionalSection[];
  cta?: { label: string; url: string };
  footerNote?: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatDateShort(value: Date | string | null | undefined): string {
  if (!value) return 'Por definir';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return 'Por definir';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return 'Por definir';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return 'Por definir';
  return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatModality(value: string | null | undefined): string {
  if (!value) return '—';
  const map: Record<string, string> = {
    VIRTUAL: 'Virtual',
    HIBRIDA: 'Híbrida',
    PRESENCIAL: 'Presencial',
  };
  return map[value.toUpperCase()] ?? value;
}

export function buildFrontendUrl(path: string): string {
  const base = (
    process.env.FRONTEND_APP_URL ??
    process.env.APP_PUBLIC_URL ??
    process.env.APP_URL ??
    process.env.CORS_ORIGIN?.split(',')[0] ??
    'http://localhost:5173'
  )
    .trim()
    .replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function buildInstitutionalSubject(title: string, detail?: string | null): string {
  const suffix = detail?.trim() ? `: ${detail.trim()}` : '';
  return `[Operación Académica CUN] ${title}${suffix}`;
}

function renderDivider(): string {
  return `
    <tr>
      <td style="padding:0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="border-top:1px solid ${INSTITUTIONAL_BRAND.divider};font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>
      </td>
    </tr>`;
}

function renderHighlights(highlights: InstitutionalHighlight[]): string {
  const colWidth = Math.floor(100 / highlights.length);
  const cells = highlights
    .map(
      (h) => `
        <td width="${colWidth}%" valign="top" class="stack-column" style="padding:0 8px 16px 0;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${INSTITUTIONAL_BRAND.textLight};text-transform:uppercase;letter-spacing:0.6px;">
            ${escapeHtml(h.label)}
          </p>
          <p style="margin:0;font-size:16px;font-weight:600;color:${INSTITUTIONAL_BRAND.text};line-height:1.4;">
            ${escapeHtml(h.value)}
          </p>
        </td>`,
    )
    .join('');

  return `
    <tr>
      <td style="padding:0 32px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>${cells}</tr>
        </table>
      </td>
    </tr>`;
}

function renderSummary(summaryLines: string[]): string {
  const colWidth = Math.floor(100 / summaryLines.length);
  const items = summaryLines
    .map(
      (line) => `
        <td width="${colWidth}%" valign="top" class="stack-column" style="padding:0 12px 0 0;">
          <p style="margin:0;font-size:14px;color:${INSTITUTIONAL_BRAND.textMuted};line-height:1.5;">
            ${escapeHtml(line)}
          </p>
        </td>`,
    )
    .join('');

  return `
    <tr>
      <td style="padding:8px 32px 0;">
        <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:${INSTITUTIONAL_BRAND.textLight};text-transform:uppercase;letter-spacing:0.6px;">
          Resumen
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>${items}</tr>
        </table>
      </td>
    </tr>`;
}

function renderSection(section: InstitutionalSection): string {
  return `
    <tr>
      <td style="padding:8px 32px 0;">
        <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:${INSTITUTIONAL_BRAND.textLight};text-transform:uppercase;letter-spacing:0.6px;">
          ${escapeHtml(section.title)}
        </p>
        <div style="font-size:14px;color:${INSTITUTIONAL_BRAND.text};line-height:1.6;">
          ${section.html}
        </div>
      </td>
    </tr>`;
}

function renderCta(label: string, url: string): string {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `
    <tr>
      <td align="center" style="padding:28px 32px 8px;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
          href="${safeUrl}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="12%"
          strokecolor="${INSTITUTIONAL_BRAND.orange}" fillcolor="${INSTITUTIONAL_BRAND.orange}">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">
            ${safeLabel}
          </center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
          <tr>
            <td align="center" bgcolor="${INSTITUTIONAL_BRAND.orange}" style="border-radius:6px;mso-padding-alt:14px 32px;">
              <a href="${safeUrl}"
                 style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;
                        font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;
                        border-radius:6px;background-color:${INSTITUTIONAL_BRAND.orange};">
                ${safeLabel}
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </td>
    </tr>`;
}

export function buildInstitutionalEmailLayout(
  input: InstitutionalEmailLayoutInput,
): { html: string; text: string } {
  const {
    title,
    eventLabel,
    intro,
    highlights = [],
    summaryLines = [],
    sections = [],
    cta,
    footerNote,
  } = input;

  const eventBadge = eventLabel
    ? `<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:${INSTITUTIONAL_BRAND.orange};text-transform:uppercase;letter-spacing:0.8px;">
         ${escapeHtml(eventLabel)}
       </p>`
    : '';

  const introBlock = intro
    ? `<p style="margin:0 0 24px;font-size:15px;color:${INSTITUTIONAL_BRAND.textMuted};line-height:1.65;">
         ${escapeHtml(intro)}
       </p>`
    : '';

  const highlightBlock = highlights.length ? renderHighlights(highlights) : '';
  const dividerAfterHighlights = highlights.length ? renderDivider() : '';
  const summaryBlock = summaryLines.length ? renderSummary(summaryLines) : '';
  const dividerAfterSummary = summaryLines.length ? renderDivider() : '';
  const sectionBlocks = sections.map((s) => renderSection(s)).join('');
  const dividerBeforeCta = cta && (sections.length || summaryLines.length || highlights.length) ? renderDivider() : '';
  const ctaBlock = cta ? renderCta(cta.label, cta.url) : '';

  const html = `<!DOCTYPE html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @media only screen and (max-width:620px) {
      .email-container { width:100% !important; }
      .stack-column { display:block !important; width:100% !important; padding:0 0 12px 0 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${INSTITUTIONAL_BRAND.bg};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:${INSTITUTIONAL_BRAND.bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background-color:${INSTITUTIONAL_BRAND.white};border-radius:8px;overflow:hidden;
                      box-shadow:0 2px 12px rgba(0,0,0,0.06);">
          <tr>
            <td bgcolor="${INSTITUTIONAL_BRAND.orange}" style="background-color:${INSTITUTIONAL_BRAND.orange};padding:28px 32px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">
                Operación Académica CUN
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;">
              ${eventBadge}
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${INSTITUTIONAL_BRAND.navy};line-height:1.3;">
                ${escapeHtml(title)}
              </h1>
              ${introBlock}
            </td>
          </tr>
          ${highlightBlock}
          ${dividerAfterHighlights}
          ${summaryBlock}
          ${dividerAfterSummary}
          ${sectionBlocks}
          ${dividerBeforeCta}
          ${ctaBlock}
          <tr>
            <td style="padding:24px 32px 28px;background-color:${INSTITUTIONAL_BRAND.card};border-top:1px solid ${INSTITUTIONAL_BRAND.border};">
              <p style="margin:0;font-size:12px;color:${INSTITUTIONAL_BRAND.textLight};text-align:center;line-height:1.5;">
                ${escapeHtml(footerNote ?? 'Correo automático generado por Operación Académica CUN.')}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [
    'OPERACIÓN ACADÉMICA CUN',
    '',
    eventLabel ?? '',
    title,
    '',
    intro ?? '',
    highlights.length ? '—'.repeat(48) : '',
    ...highlights.map((h) => `${h.label}\n${h.value}`),
    summaryLines.length ? '—'.repeat(48) : '',
    summaryLines.length ? 'RESUMEN' : '',
    ...summaryLines,
    ...sections.flatMap((s) => ['—'.repeat(48), s.title.toUpperCase(), s.text]),
    cta ? '—'.repeat(48) : '',
    cta ? `[ ${cta.label} ]\n${cta.url}` : '',
    '',
    footerNote ?? 'Correo automático generado por Operación Académica CUN.',
  ].filter((line, i, arr) => line !== '' || (i > 0 && arr[i - 1] !== ''));

  return { html, text: textParts.join('\n') };
}

export function buildBulletList(items: string[]): { html: string; text: string } {
  if (!items.length) {
    return { html: '<p style="margin:0;color:#9CA3AF;">—</p>', text: '—' };
  }
  return {
    html: `<ul style="margin:0;padding:0 0 0 18px;">${items.map((item) => `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`).join('')}</ul>`,
    text: items.map((item) => `• ${item}`).join('\n'),
  };
}

export function buildSemesterStructure(
  semesters: Array<{ semesterNumber: number; subjects: Array<{ name: string }> }>,
): { html: string; text: string } {
  if (!semesters.length) {
    return { html: '<p style="margin:0;color:#9CA3AF;">—</p>', text: '—' };
  }

  const htmlParts: string[] = [];
  const textParts: string[] = [];

  for (const semester of semesters) {
    const subjects = semester.subjects.map((s) => s.name);
    const bullets = buildBulletList(subjects);
    htmlParts.push(`
      <div style="margin-bottom:16px;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:${INSTITUTIONAL_BRAND.text};">
          Semestre ${semester.semesterNumber}
        </p>
        ${bullets.html}
      </div>`);
    textParts.push(`Semestre ${semester.semesterNumber}`, bullets.text);
  }

  return { html: htmlParts.join(''), text: textParts.join('\n') };
}
