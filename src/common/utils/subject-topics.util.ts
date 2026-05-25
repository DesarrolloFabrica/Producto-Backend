import { BadRequestException } from '@nestjs/common';
import {
  SUBJECT_TOPICS_MAX,
  SUBJECT_TOPICS_MIN,
  SUBJECT_TOPICS_RANGE_MESSAGE,
} from '../constants/subject-topics.constants';

export function assertSubjectTopicsCount(count: number): void {
  if (count < SUBJECT_TOPICS_MIN || count > SUBJECT_TOPICS_MAX) {
    throw new BadRequestException(SUBJECT_TOPICS_RANGE_MESSAGE);
  }
}

export function assertTopicsAdditionWithinMax(
  existingCount: number,
  incomingCount: number,
): void {
  const total = existingCount + incomingCount;
  if (total > SUBJECT_TOPICS_MAX) {
    throw new BadRequestException(
      `Cannot exceed ${SUBJECT_TOPICS_MAX} topics per subject. Current: ${existingCount}, adding: ${incomingCount}.`,
    );
  }
}
