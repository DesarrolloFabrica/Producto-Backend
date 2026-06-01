import { Injectable, Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { UserRole } from '../common/enums/user-role.enum';

import type { ObservationEntity } from '../observations/observation.entity';

import { ProjectDetailDto } from '../projects/dto/project-response.dto';

import { SubjectEntity } from '../subjects/subject.entity';

import { UserEntity } from '../users/user.entity';

import { EmailService, SendMailOptions } from '../email/email.service';

import { resolvePrimaryInstitutionalRecipient } from '../email/recipient-resolver';

import {

  buildFactoryCorrectionsBatchEmail,

  buildProductObservationsBatchEmail,

} from './templates/observation-batch.template';

import { buildProductRequestCreatedEmail } from './templates/product-request-created.template';

import {

  buildProductRequestUpdatedEmail,

  type ProductRequestChangeSummary,

} from './templates/product-request-updated.template';



export type { SendMailOptions };

/** Destinatario lógico de nueva solicitud (fase actual; luego por rol/flujo). */
const PRODUCT_REQUEST_CREATED_RECIPIENT = 'desarrollofabrica@cun.edu.co';

@Injectable()

export class MailService {

  private readonly logger = new Logger(MailService.name);



  constructor(

    private readonly emailService: EmailService,

    @InjectRepository(UserEntity)

    private readonly userRepo: Repository<UserEntity>,

  ) {}



  async sendMail(options: SendMailOptions): Promise<void> {

    await this.emailService.sendMail(options);

  }



  private async resolveInstitutionalRecipient(params: {

    primary?: string | null;

    roleFallback: UserRole;

    eventType: string;

    projectId?: string;

    subjectLine: string;

  }): Promise<string | null> {

    const to = await resolvePrimaryInstitutionalRecipient({

      primary: params.primary,

      roleFallback: params.roleFallback,

      userRepo: this.userRepo,

    });



    if (!to) {

      this.logger.warn(

        `Sin destinatario institucional para ${params.eventType} (rol ${params.roleFallback})`,

      );

      await this.emailService.recordSkippedDelivery({

        originalRecipient: `role:${params.roleFallback}:${params.eventType}`,

        subject: params.subjectLine,

        eventType: params.eventType,

        reason: 'Sin destinatario institucional válido',

        metadata: { projectId: params.projectId, eventType: params.eventType },

      });

      return null;

    }



    return to;

  }



  async sendProductRequestCreatedEmail(project: ProjectDetailDto): Promise<void> {
    if (!this.emailService.isEmailEnabled()) return;

    const { subject, html, text } = buildProductRequestCreatedEmail(project);

    await this.sendMail({
      to: PRODUCT_REQUEST_CREATED_RECIPIENT,
      subject,
      html,
      text,
      metadata: {
        eventType: 'PRODUCT_REQUEST_CREATED',
        projectId: project.id,
        createdByName: project.productOwner?.name ?? null,
        createdByEmail: project.productOwner?.email ?? null,
        emailIncludesCreatedBy: html.includes('Creado por'),
      },
    });
  }



  async sendProductRequestUpdatedEmail(

    project: ProjectDetailDto,

    changeSummary: ProductRequestChangeSummary,

  ): Promise<void> {

    if (!this.emailService.isEmailEnabled()) return;



    const { subject, html, text } = buildProductRequestUpdatedEmail(project, changeSummary);

    const to = await this.resolveInstitutionalRecipient({

      primary: project.factoryOwner?.email,

      roleFallback: UserRole.PLANEACION,

      eventType: 'PROJECT_MODIFIED',

      projectId: project.id,

      subjectLine: subject,

    });

    if (!to) return;



    await this.sendMail({ to, subject, html, text, metadata: { eventType: 'PROJECT_MODIFIED', projectId: project.id } });

  }



  async sendProductObservationsBatchEmail(params: {

    subject: SubjectEntity;

    observations: ObservationEntity[];

    batchId: string;

  }): Promise<void> {

    if (!this.emailService.isEmailEnabled()) return;



    const { subject, html, text } = buildProductObservationsBatchEmail(params);

    const to = await this.resolveInstitutionalRecipient({

      primary: params.subject.project?.factoryOwner?.email,

      roleFallback: UserRole.FABRICA,

      eventType: 'OBSERVATION_BATCH_SENT',

      projectId: params.subject.project?.id,

      subjectLine: subject,

    });

    if (!to) return;



    await this.sendMail({

      to,

      subject,

      html,

      text,

      metadata: {

        eventType: 'OBSERVATION_BATCH_SENT',

        subjectId: params.subject.id,

        projectId: params.subject.project?.id,

      },

    });

  }



  async sendFactoryCorrectionsBatchEmail(params: {

    subject: SubjectEntity;

    observations: ObservationEntity[];

    batchId: string;

  }): Promise<void> {

    if (!this.emailService.isEmailEnabled()) return;



    const { subject, html, text } = buildFactoryCorrectionsBatchEmail(params);

    const to = await this.resolveInstitutionalRecipient({

      primary: params.subject.project?.productOwner?.email,

      roleFallback: UserRole.PRODUCT,

      eventType: 'CORRECTION_BATCH_NOTIFIED',

      projectId: params.subject.project?.id,

      subjectLine: subject,

    });

    if (!to) return;



    await this.sendMail({

      to,

      subject,

      html,

      text,

      metadata: {

        eventType: 'CORRECTION_BATCH_NOTIFIED',

        subjectId: params.subject.id,

        projectId: params.subject.project?.id,

      },

    });

  }

}


