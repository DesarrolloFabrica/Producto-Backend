import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { InstitutionalOperationalAction } from '../common/enums/institutional-operational-action.enum';
import type { ObservationEntity } from '../observations/observation.entity';
import { ProjectDetailDto } from '../projects/dto/project-response.dto';
import { SubjectEntity } from '../subjects/subject.entity';
import {
  buildFactoryCorrectionsBatchEmail,
  buildProductObservationsBatchEmail,
} from './templates/observation-batch.template';
import { buildProductRequestCreatedEmail } from './templates/product-request-created.template';
import { buildProductRequestUpdatedEmail, type ProductRequestChangeSummary } from './templates/product-request-updated.template';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  private isEmailEnabled(): boolean {
    return (process.env.EMAIL_ENABLED ?? 'false').toLowerCase() === 'true';
  }

  private getTransportMode(): 'log' | 'smtp' {
    const mode = (process.env.EMAIL_TRANSPORT ?? 'smtp').toLowerCase();
    return mode === 'log' ? 'log' : 'smtp';
  }

  private getNotifyEmail(): string | null {
    const email = (process.env.PRODUCT_REQUEST_NOTIFY_EMAIL ?? '').trim();
    return email || null;
  }

  private resolveRecipient(primary?: string | null): string | null {
    const direct = primary?.trim();
    if (direct) return direct;
    return this.getNotifyEmail();
  }

  private isSmtpConfigured(): boolean {
    const host = (process.env.EMAIL_HOST ?? '').trim();
    const user = (process.env.EMAIL_USER ?? '').trim();
    const password = (process.env.EMAIL_PASSWORD ?? '').trim();
    return Boolean(host && user && password);
  }

  private getFromAddress(): string {
    return process.env.EMAIL_FROM?.trim() || 'Producto CUN <no-reply@cun.edu.co>';
  }

  private getTransporter(): Transporter | null {
    if (this.transporter) return this.transporter;

    if (!this.isSmtpConfigured()) {
      return null;
    }

    const port = Number(process.env.EMAIL_PORT ?? 587);
    const secure = (process.env.EMAIL_SECURE ?? 'false').toLowerCase() === 'true';

    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number.isFinite(port) ? port : 587,
      secure,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    return this.transporter;
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    if (!this.isEmailEnabled()) {
      return;
    }

    const { to, subject, html, text } = options;

    if (this.getTransportMode() === 'log') {
      const preview = (text ?? html.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 400);
      this.logger.log(
        `[EMAIL log] to=${to} | subject=${subject} | preview=${preview}${preview.length >= 400 ? '…' : ''}`,
      );
      return;
    }

    if (!this.isSmtpConfigured()) {
      this.logger.warn(
        'EMAIL_ENABLED=true pero SMTP incompleto (EMAIL_HOST, EMAIL_USER o EMAIL_PASSWORD). Correo no enviado.',
      );
      return;
    }

    const transporter = this.getTransporter();
    if (!transporter) {
      this.logger.warn('No se pudo inicializar el transporte SMTP. Correo no enviado.');
      return;
    }

    try {
      await transporter.sendMail({
        from: this.getFromAddress(),
        to,
        subject,
        html,
        text: text ?? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      });
      this.logger.log(`Correo enviado a ${to} — asunto: ${subject}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Error al enviar correo: ${message}`);
    }
  }

  async sendProductRequestCreatedEmail(project: ProjectDetailDto): Promise<void> {
    if (!this.isEmailEnabled()) return;

    const to = this.getNotifyEmail();
    if (!to) {
      this.logger.warn('PRODUCT_REQUEST_NOTIFY_EMAIL no configurado. Correo de nueva solicitud omitido.');
      return;
    }

    const { subject, html, text } = buildProductRequestCreatedEmail(project);
    await this.sendMail({ to, subject, html, text });
  }

  async sendProductRequestUpdatedEmail(
    project: ProjectDetailDto,
    changeSummary: ProductRequestChangeSummary,
  ): Promise<void> {
    if (!this.isEmailEnabled()) return;

    const to = this.getNotifyEmail();
    if (!to) {
      this.logger.warn('PRODUCT_REQUEST_NOTIFY_EMAIL no configurado. Correo de modificación omitido.');
      return;
    }

    const { subject, html, text } = buildProductRequestUpdatedEmail(project, changeSummary);
    await this.sendMail({ to, subject, html, text });
  }

  async sendProductObservationsBatchEmail(params: {
    subject: SubjectEntity;
    observations: ObservationEntity[];
    batchId: string;
  }): Promise<void> {
    if (!this.isEmailEnabled()) return;

    const to = this.resolveRecipient(params.subject.project?.factoryOwner?.email);
    if (!to) {
      this.logger.warn('Sin destinatario para correo de observaciones a Fábrica.');
      return;
    }

    const { subject, html, text } = buildProductObservationsBatchEmail(params);
    await this.sendMail({ to, subject, html, text });
  }

  async sendFactoryCorrectionsBatchEmail(params: {
    subject: SubjectEntity;
    observations: ObservationEntity[];
    batchId: string;
  }): Promise<void> {
    if (!this.isEmailEnabled()) return;

    const to = this.resolveRecipient(params.subject.project?.productOwner?.email);
    if (!to) {
      this.logger.warn('Sin destinatario para correo de correcciones a Product.');
      return;
    }

    const { subject, html, text } = buildFactoryCorrectionsBatchEmail(params);
    await this.sendMail({ to, subject, html, text });
  }

  async sendInstitutionalTransitionEmail(params: {
    subject: SubjectEntity;
    action: InstitutionalOperationalAction;
    reason?: string | null;
  }): Promise<void> {
    if (!this.isEmailEnabled()) return;

    const to = this.getNotifyEmail();
    if (!to) return;

    const { subject, action, reason } = params;
    const project = subject.project;
    const title = `Workflow: ${subject.name}`;
    const body = [
      `<p><strong>Asignatura:</strong> ${subject.name}</p>`,
      `<p><strong>Programa:</strong> ${project?.program ?? '—'}</p>`,
      `<p><strong>Acción:</strong> ${action}</p>`,
      `<p><strong>Estado operacional:</strong> ${subject.operationalState}</p>`,
      reason ? `<p><strong>Motivo:</strong> ${reason}</p>` : '',
    ].join('');
    await this.sendMail({
      to,
      subject: title,
      html: `<html><body>${body}</body></html>`,
      text: `${title} — ${action}`,
    });
  }
}
