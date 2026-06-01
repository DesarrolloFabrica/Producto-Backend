import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Repository } from 'typeorm';
import { EmailDeliveryStatus } from '../common/enums/email-delivery-status.enum';
import { NotificationEntity } from '../notifications/notification.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { UserEntity } from '../users/user.entity';
import {
  EmailDeliveryLogItemDto,
  EmailDeliveryLogListResponseDto,
  SendMailResultDto,
} from './dto/email-delivery-log.dto';
import { EmailDeliveryLogEntity } from './email-delivery-log.entity';
import {
  getRealModeRecipientBlockReason,
} from './email-recipient-validator';
import { resolvePrimaryRecipient } from './recipient-resolver';
import {
  buildInstitutionalNotificationEmail,
  getInstitutionalEventLabel,
} from './templates/institutional-notification.template';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  metadata?: {
    notificationId?: string;
    eventType?: string;
    entityType?: string;
    projectId?: string;
    semesterId?: string;
    subjectId?: string;
    [key: string]: unknown;
  };
  throwOnError?: boolean;
}

export interface SendMailResult {
  success: boolean;
  effectiveRecipient: string;
  originalRecipient: string;
  status: EmailDeliveryStatus;
  errorMessage?: string;
}

export const EMAIL_TEST_MODE_BLOCK_REASON =
  'EMAIL_TEST_MODE activo pero EMAIL_TEST_RECIPIENT no configurado';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private transporterCacheKey: string | null = null;

  constructor(
    @InjectRepository(EmailDeliveryLogEntity)
    private readonly deliveryLogRepo: Repository<EmailDeliveryLogEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
  ) {}

  isEmailEnabled(): boolean {
    return (process.env.EMAIL_ENABLED ?? 'false').toLowerCase() === 'true';
  }

  getProvider(): 'smtp' | 'log' {
    const provider = (process.env.EMAIL_PROVIDER ?? '').trim().toLowerCase();
    if (provider === 'log') return 'log';
    const legacy = (process.env.EMAIL_TRANSPORT ?? 'smtp').trim().toLowerCase();
    return legacy === 'log' ? 'log' : 'smtp';
  }

  isTestMode(): boolean {
    return (process.env.EMAIL_TEST_MODE ?? 'true').trim().toLowerCase() === 'true';
  }

  getTestRecipient(): string | null {
    const email = (process.env.EMAIL_TEST_RECIPIENT ?? '').trim();
    return email || null;
  }

  /** Fail-closed: en modo prueba sin destinatario configurado, bloquear envío. */
  getTestModeBlockReason(): string | null {
    if (this.isTestMode() && !this.getTestRecipient()) {
      return EMAIL_TEST_MODE_BLOCK_REASON;
    }
    return null;
  }

  resolveEffectiveRecipient(originalRecipient: string): string {
    if (this.isTestMode() && this.getTestRecipient()) {
      return this.getTestRecipient()!;
    }
    return originalRecipient;
  }

  private async skipTestModeBlocked(params: {
    originalRecipient: string;
    subject: string;
    eventType?: string;
    metadata?: Record<string, unknown>;
    throwOnError: boolean;
  }): Promise<SendMailResult> {
    const { originalRecipient, subject, eventType, metadata, throwOnError } = params;
    const reason = EMAIL_TEST_MODE_BLOCK_REASON;
    this.logger.warn(
      `[EMAIL] Envío bloqueado (fail-closed): ${reason} | original=${originalRecipient} | subject=${subject}`,
    );
    this.logAttempt({
      originalRecipient,
      effectiveRecipient: originalRecipient,
      subject,
      eventType,
      metadata,
      status: EmailDeliveryStatus.SKIPPED,
      errorMessage: reason,
    });
    await this.persistDeliveryLog({
      notificationId: (metadata?.notificationId as string | undefined) ?? null,
      eventType: eventType ?? null,
      originalRecipient,
      effectiveRecipient: originalRecipient,
      subject,
      status: EmailDeliveryStatus.SKIPPED,
      provider: 'test_mode_blocked',
      errorMessage: reason,
      metadata: metadata ?? null,
    });
    if (throwOnError) {
      throw new UnprocessableEntityException(reason);
    }
    return {
      success: false,
      originalRecipient,
      effectiveRecipient: originalRecipient,
      status: EmailDeliveryStatus.SKIPPED,
      errorMessage: reason,
    };
  }

  private async skipRealModeBlocked(params: {
    originalRecipient: string;
    effectiveRecipient: string;
    subject: string;
    eventType?: string;
    metadata?: Record<string, unknown>;
    throwOnError: boolean;
    reason: string;
  }): Promise<SendMailResult> {
    const { originalRecipient, effectiveRecipient, subject, eventType, metadata, throwOnError, reason } =
      params;
    this.logger.warn(
      `[EMAIL] Envío bloqueado (dominio): ${reason} | original=${originalRecipient} | effective=${effectiveRecipient} | subject=${subject}`,
    );
    this.logAttempt({
      originalRecipient,
      effectiveRecipient,
      subject,
      eventType,
      metadata,
      status: EmailDeliveryStatus.SKIPPED,
      errorMessage: reason,
    });
    await this.persistDeliveryLog({
      notificationId: (metadata?.notificationId as string | undefined) ?? null,
      eventType: eventType ?? null,
      originalRecipient,
      effectiveRecipient,
      subject,
      status: EmailDeliveryStatus.SKIPPED,
      provider: 'real_mode_blocked',
      errorMessage: reason,
      metadata: metadata ?? null,
    });
    if (throwOnError) {
      throw new UnprocessableEntityException(reason);
    }
    return {
      success: false,
      originalRecipient,
      effectiveRecipient,
      status: EmailDeliveryStatus.SKIPPED,
      errorMessage: reason,
    };
  }

  /** Valida destinatario cuando EMAIL_TEST_MODE=false (envío real). */
  getRealModeBlockReason(recipient: string): string | null {
    if (this.isTestMode()) return null;
    return getRealModeRecipientBlockReason(recipient);
  }

  private getSmtpHost(): string {
    return (process.env.SMTP_HOST ?? process.env.EMAIL_HOST ?? '').trim();
  }

  private getSmtpPort(): number {
    const port = Number(process.env.SMTP_PORT ?? process.env.EMAIL_PORT ?? 587);
    return Number.isFinite(port) ? port : 587;
  }

  private getSmtpUser(): string {
    return (process.env.SMTP_USER ?? process.env.EMAIL_USER ?? '').trim();
  }

  private getSmtpPass(): string {
    return (process.env.SMTP_PASS ?? process.env.EMAIL_PASSWORD ?? '').trim();
  }

  private isSmtpSecure(): boolean {
    const value = (process.env.SMTP_SECURE ?? process.env.EMAIL_SECURE ?? 'false').toLowerCase();
    return value === 'true';
  }

  isSmtpConfigured(): boolean {
    return Boolean(this.getSmtpHost() && this.getSmtpUser() && this.getSmtpPass());
  }

  getFromAddress(): string {
    const name = (process.env.EMAIL_FROM_NAME ?? 'Operación Académica CUN').trim();
    let address = (process.env.EMAIL_FROM_ADDRESS ?? '').trim();
    const smtpUser = this.getSmtpUser();
    const host = this.getSmtpHost().toLowerCase();

    // Gmail SMTP: el remitente visible debe coincidir con SMTP_USER (cuenta autenticada).
    if (host.includes('gmail.com') && smtpUser) {
      if (address && address.toLowerCase() !== smtpUser.toLowerCase()) {
        this.logger.warn(
          `EMAIL_FROM_ADDRESS (${address}) difiere de SMTP_USER (${smtpUser}); usando SMTP_USER como remitente.`,
        );
      }
      address = smtpUser;
    } else if (!address) {
      const legacy = (process.env.EMAIL_FROM ?? '').trim();
      if (legacy) return legacy;
      address = smtpUser || 'no-reply@cun.edu.co';
    }

    return `"${name}" <${address}>`;
  }

  private buildTransporterCacheKey(): string {
    return [this.getSmtpHost(), this.getSmtpPort(), this.getSmtpUser(), this.getSmtpPass(), this.isSmtpSecure()].join('|');
  }

  private getTransporter(): Transporter | null {
    const cacheKey = this.buildTransporterCacheKey();
    if (this.transporter && this.transporterCacheKey === cacheKey) {
      return this.transporter;
    }

    this.transporter = null;
    this.transporterCacheKey = null;
    if (!this.isSmtpConfigured()) return null;

    this.transporterCacheKey = cacheKey;
    this.transporter = nodemailer.createTransport({
      host: this.getSmtpHost(),
      port: this.getSmtpPort(),
      secure: this.isSmtpSecure(),
      auth: {
        user: this.getSmtpUser(),
        pass: this.getSmtpPass(),
      },
      tls: { minVersion: 'TLSv1.2' },
      ...(this.getSmtpPort() === 587 && !this.isSmtpSecure() ? { requireTLS: true } : {}),
    });

    return this.transporter;
  }

  private async persistDeliveryLog(params: {
    notificationId?: string | null;
    eventType?: string | null;
    originalRecipient: string;
    effectiveRecipient: string;
    subject: string;
    status: EmailDeliveryStatus;
    provider: string;
    errorMessage?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      await this.deliveryLogRepo.save(
        this.deliveryLogRepo.create({
          notification: params.notificationId ? ({ id: params.notificationId } as NotificationEntity) : null,
          eventType: params.eventType ?? null,
          originalRecipient: params.originalRecipient,
          effectiveRecipient: params.effectiveRecipient,
          subject: params.subject.slice(0, 500),
          status: params.status,
          provider: params.provider,
          errorMessage: params.errorMessage ?? null,
          metadata: params.metadata ?? null,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No se pudo persistir email_delivery_log: ${message}`);
    }
  }

  private logAttempt(params: {
    originalRecipient: string;
    effectiveRecipient: string;
    subject: string;
    eventType?: string;
    metadata?: Record<string, unknown>;
    status: EmailDeliveryStatus;
    errorMessage?: string;
  }): void {
    const { originalRecipient, effectiveRecipient, subject, eventType, metadata, status, errorMessage } = params;
    const meta = {
      originalRecipient,
      effectiveRecipient,
      subject,
      eventType: eventType ?? metadata?.eventType ?? null,
      projectId: metadata?.projectId ?? null,
      semesterId: metadata?.semesterId ?? null,
      subjectId: metadata?.subjectId ?? null,
      entityType: metadata?.entityType ?? null,
      status,
      errorMessage: errorMessage ?? null,
    };
    if (status === EmailDeliveryStatus.FAILED) {
      this.logger.warn(`[EMAIL] intento fallido: ${JSON.stringify(meta)}`);
    } else {
      this.logger.log(`[EMAIL] ${JSON.stringify(meta)}`);
    }
  }

  async sendMail(options: SendMailOptions): Promise<SendMailResult> {
    const { to, subject, html, text, metadata, throwOnError = false } = options;
    const originalRecipient = to.trim();
    const deliveryMetadata = {
      ...(metadata ?? {}),
      fromAddress: this.getFromAddress(),
    };
    const eventType = deliveryMetadata?.eventType as string | undefined;

    if (this.getTestModeBlockReason()) {
      return this.skipTestModeBlocked({
        originalRecipient,
        subject,
        eventType,
        metadata: deliveryMetadata,
        throwOnError,
      });
    }

    const effectiveRecipient = this.resolveEffectiveRecipient(originalRecipient);

    const realModeBlockReason = this.getRealModeBlockReason(effectiveRecipient);
    if (realModeBlockReason) {
      return this.skipRealModeBlocked({
        originalRecipient,
        effectiveRecipient,
        subject,
        eventType,
        metadata: deliveryMetadata,
        throwOnError,
        reason: realModeBlockReason,
      });
    }

    const provider = this.getProvider();

    const baseResult: SendMailResult = {
      success: false,
      effectiveRecipient,
      originalRecipient,
      status: EmailDeliveryStatus.SKIPPED,
    };

    if (!this.isEmailEnabled()) {
      this.logAttempt({
        originalRecipient,
        effectiveRecipient,
        subject,
        eventType,
        metadata: deliveryMetadata,
        status: EmailDeliveryStatus.SKIPPED,
        errorMessage: 'EMAIL_ENABLED=false',
      });
      await this.persistDeliveryLog({
        notificationId: deliveryMetadata?.notificationId ?? null,
        eventType: eventType ?? null,
        originalRecipient,
        effectiveRecipient,
        subject,
        status: EmailDeliveryStatus.SKIPPED,
        provider: 'disabled',
        errorMessage: 'EMAIL_ENABLED=false',
        metadata: deliveryMetadata,
      });
      return baseResult;
    }

    const preview = (text ?? html.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 400);

    if (provider === 'log') {
      this.logger.log(
        `[EMAIL log] original=${originalRecipient} effective=${effectiveRecipient} | subject=${subject} | eventType=${eventType ?? '—'} | preview=${preview}${preview.length >= 400 ? '…' : ''}`,
      );
      this.logAttempt({
        originalRecipient,
        effectiveRecipient,
        subject,
        eventType,
        metadata: deliveryMetadata,
        status: EmailDeliveryStatus.SKIPPED,
        errorMessage: 'log_mode',
      });
      await this.persistDeliveryLog({
        notificationId: deliveryMetadata?.notificationId ?? null,
        eventType: eventType ?? null,
        originalRecipient,
        effectiveRecipient,
        subject,
        status: EmailDeliveryStatus.SKIPPED,
        provider: 'log',
        errorMessage: 'log_mode',
        metadata: deliveryMetadata,
      });
      return { ...baseResult, success: true, status: EmailDeliveryStatus.SKIPPED };
    }

    if (!this.isSmtpConfigured()) {
      const errorMessage = 'SMTP incompleto (SMTP_HOST, SMTP_USER o SMTP_PASS)';
      this.logger.warn(`EMAIL_ENABLED=true pero ${errorMessage}. Correo no enviado.`);
      this.logAttempt({
        originalRecipient,
        effectiveRecipient,
        subject,
        eventType,
        metadata: deliveryMetadata,
        status: EmailDeliveryStatus.FAILED,
        errorMessage,
      });
      await this.persistDeliveryLog({
        notificationId: deliveryMetadata?.notificationId ?? null,
        eventType: eventType ?? null,
        originalRecipient,
        effectiveRecipient,
        subject,
        status: EmailDeliveryStatus.FAILED,
        provider: 'smtp',
        errorMessage,
        metadata: deliveryMetadata,
      });
      if (throwOnError) {
        throw new BadRequestException(errorMessage);
      }
      return { ...baseResult, status: EmailDeliveryStatus.FAILED, errorMessage };
    }

    const transporter = this.getTransporter();
    if (!transporter) {
      const errorMessage = 'No se pudo inicializar el transporte SMTP';
      await this.persistDeliveryLog({
        notificationId: deliveryMetadata?.notificationId ?? null,
        eventType: eventType ?? null,
        originalRecipient,
        effectiveRecipient,
        subject,
        status: EmailDeliveryStatus.FAILED,
        provider: 'smtp',
        errorMessage,
        metadata: deliveryMetadata,
      });
      if (throwOnError) throw new BadGatewayException(errorMessage);
      return { ...baseResult, status: EmailDeliveryStatus.FAILED, errorMessage };
    }

    try {
      const from = deliveryMetadata.fromAddress as string;
      await transporter.sendMail({
        from,
        to: effectiveRecipient,
        subject,
        html,
        text: text ?? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      });

      this.logger.log(
        `Correo enviado from=${from} effective=${effectiveRecipient} original=${originalRecipient} — asunto: ${subject}`,
      );
      this.logAttempt({
        originalRecipient,
        effectiveRecipient,
        subject,
        eventType,
        metadata: deliveryMetadata,
        status: EmailDeliveryStatus.SENT,
      });
      await this.persistDeliveryLog({
        notificationId: deliveryMetadata?.notificationId ?? null,
        eventType: eventType ?? null,
        originalRecipient,
        effectiveRecipient,
        subject,
        status: EmailDeliveryStatus.SENT,
        provider: 'smtp',
        metadata: deliveryMetadata,
      });

      return {
        success: true,
        effectiveRecipient,
        originalRecipient,
        status: EmailDeliveryStatus.SENT,
      };
    } catch (error) {
      const errorMessage = this.formatSmtpError(error);
      this.logger.warn(`Error al enviar correo a ${effectiveRecipient}: ${errorMessage}`);
      this.logAttempt({
        originalRecipient,
        effectiveRecipient,
        subject,
        eventType,
        metadata: deliveryMetadata,
        status: EmailDeliveryStatus.FAILED,
        errorMessage,
      });
      await this.persistDeliveryLog({
        notificationId: deliveryMetadata?.notificationId ?? null,
        eventType: eventType ?? null,
        originalRecipient,
        effectiveRecipient,
        subject,
        status: EmailDeliveryStatus.FAILED,
        provider: 'smtp',
        errorMessage,
        metadata: deliveryMetadata,
      });
      if (throwOnError) throw new BadGatewayException(errorMessage);
      return {
        success: false,
        effectiveRecipient,
        originalRecipient,
        status: EmailDeliveryStatus.FAILED,
        errorMessage,
      };
    }
  }

  async recordSkippedDelivery(params: {
    originalRecipient: string;
    subject: string;
    eventType?: string;
    reason: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { originalRecipient, subject, eventType, reason, metadata } = params;
    this.logAttempt({
      originalRecipient,
      effectiveRecipient: originalRecipient,
      subject,
      eventType,
      metadata,
      status: EmailDeliveryStatus.SKIPPED,
      errorMessage: reason,
    });
    await this.persistDeliveryLog({
      notificationId: (metadata?.notificationId as string | undefined) ?? null,
      eventType: eventType ?? null,
      originalRecipient,
      effectiveRecipient: originalRecipient,
      subject,
      status: EmailDeliveryStatus.SKIPPED,
      provider: 'no_recipient',
      errorMessage: reason,
      metadata: metadata ?? null,
    });
  }

  async sendForNotificationById(notificationId: string): Promise<void> {
    const notification = await this.notificationRepo.findOne({ where: { id: notificationId } });
    if (!notification) {
      this.logger.warn(`Notificación ${notificationId} no encontrada para envío de correo`);
      return;
    }
    await this.sendForNotification(notification);
  }

  async sendForNotification(notification: NotificationEntity): Promise<void> {
    try {
      const originalRecipient = await resolvePrimaryRecipient({
        eventType: notification.eventType!,
        roleTarget: notification.roleTarget,
        userId: notification.userId,
        userRepo: this.userRepo,
      });

      const context = await this.buildNotificationContext(notification);
      const eventLabel = getInstitutionalEventLabel(notification.eventType);
      const { subject, html, text } = buildInstitutionalNotificationEmail({
        title: notification.title,
        message: notification.message,
        eventLabel,
        context,
        actionUrl: notification.actionUrl,
      });

      if (!originalRecipient) {
        const roleLabel = notification.roleTarget ?? notification.userId ?? 'unknown';
        await this.recordSkippedDelivery({
          originalRecipient: `role:${roleLabel}:${notification.eventType}`,
          subject,
          eventType: notification.eventType ?? undefined,
          reason: 'Sin destinatario institucional válido',
          metadata: {
            notificationId: notification.id,
            eventType: notification.eventType ?? undefined,
            entityType: notification.entityType ?? undefined,
            projectId: notification.projectId ?? undefined,
            subjectId: notification.subjectId ?? undefined,
            semesterId: context.semesterId,
          },
        });
        return;
      }

      await this.sendMail({
        to: originalRecipient,
        subject,
        html,
        text,
        metadata: {
          notificationId: notification.id,
          eventType: notification.eventType ?? undefined,
          entityType: notification.entityType ?? undefined,
          projectId: notification.projectId ?? undefined,
          subjectId: notification.subjectId ?? undefined,
          semesterId: context.semesterId,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`sendForNotification falló sin interrumpir workflow: ${message}`);
    }
  }

  private async buildNotificationContext(
    notification: NotificationEntity,
  ): Promise<{
    program?: string | null;
    semester?: string | null;
    responsible?: string | null;
    status?: string | null;
    deadline?: string | null;
    semesterId?: string;
  }> {
    if (notification.subjectId) {
      const subject = await this.subjectRepo.findOne({
        where: { id: notification.subjectId },
        relations: { project: { productOwner: true }, semester: true },
      });
      if (subject) {
        return {
          program: subject.project?.program ?? null,
          semester: subject.semester ? `Semestre ${subject.semester.semesterNumber}` : null,
          responsible: subject.project?.productOwner?.name ?? null,
          status: subject.operationalState ?? null,
          deadline: subject.expectedDeliveryDate
            ? subject.expectedDeliveryDate.toISOString().slice(0, 10)
            : null,
          semesterId: subject.semester?.id,
        };
      }
    }

    if (notification.projectId) {
      const project = await this.projectRepo.findOne({
        where: { id: notification.projectId },
        relations: { productOwner: true },
      });
      if (project) {
        return {
          program: project.program,
          responsible: project.productOwner?.name ?? null,
          status: project.status ?? null,
        };
      }
    }

    return {};
  }

  async findDeliveryLogs(limit = 20): Promise<EmailDeliveryLogListResponseDto> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const [items, total] = await this.deliveryLogRepo.findAndCount({
      relations: { notification: true },
      order: { createdAt: 'DESC' },
      take: safeLimit,
    });

    return {
      total,
      items: items.map((item) => this.toDeliveryLogDto(item)),
    };
  }

  private toDeliveryLogDto(item: EmailDeliveryLogEntity): EmailDeliveryLogItemDto {
    const notificationId =
      item.notification?.id ??
      (typeof item.metadata?.notificationId === 'string' ? item.metadata.notificationId : null);
    return {
      id: item.id,
      notificationId,
      eventType: item.eventType,
      originalRecipient: item.originalRecipient,
      effectiveRecipient: item.effectiveRecipient,
      subject: item.subject,
      status: item.status,
      provider: item.provider,
      errorMessage: item.errorMessage,
      metadata: item.metadata,
      createdAt: item.createdAt.toISOString(),
    };
  }

  toSendMailResultDto(result: SendMailResult): SendMailResultDto {
    return {
      success: result.success,
      effectiveRecipient: result.effectiveRecipient,
      originalRecipient: result.originalRecipient,
      status: result.status,
    };
  }

  private formatSmtpError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    const lower = raw.toLowerCase();
    const config = {
      host: this.getSmtpHost(),
      port: this.getSmtpPort(),
      secure: this.isSmtpSecure(),
    };
    const base = `SMTP [host=${config.host} port=${config.port} secure=${config.secure}]: ${raw}`;
    if (lower.includes('smtpclientauthentication is disabled') || lower.includes('smtp_auth_disabled')) {
      return `${base}. SMTP AUTH deshabilitado en Microsoft 365 — contacte IT o use relay alternativo (SendGrid/Mailtrap).`;
    }
    if (lower.includes('auth') || lower.includes('535') || lower.includes('invalid login')) {
      return `${base}. Verifique SMTP_USER y SMTP_PASS (contraseña de aplicación si usa MFA).`;
    }
    if (lower.includes('timeout') || lower.includes('etimedout')) {
      return `${base}. Timeout de red/firewall hacia ${config.host}:${config.port}.`;
    }
    if (lower.includes('econnrefused') || lower.includes('connection refused')) {
      return `${base}. Conexión rechazada — revise SMTP_HOST y SMTP_PORT.`;
    }
    if (lower.includes('certificate') || lower.includes('ssl') || lower.includes('tls')) {
      return `${base}. Problema TLS — pruebe SMTP_SECURE=${config.secure ? 'false' : 'true'}.`;
    }
    if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
      return `${base}. SMTP_HOST no resuelve DNS.`;
    }
    return base;
  }
}
