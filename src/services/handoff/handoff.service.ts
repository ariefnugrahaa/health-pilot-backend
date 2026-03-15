import { prisma } from '../../utils/database.js';
import { encryptionService } from '../../utils/encryption.js';
import logger from '../../utils/logger.js';
import { NotFoundError, ValidationError } from '../../api/middlewares/error.middleware.js';
import { v4 as uuidv4 } from 'uuid';
import type { HealthIntakeData, HandoffData } from '../../types/index.js';

export interface IHandoffService {
  initiateHandoff(userId: string, recommendationId: string, treatmentId: string): Promise<string>;
  getHandoffStatus(handoffId: string, userId: string): Promise<unknown>;
}

export class HandoffService implements IHandoffService {
  async initiateHandoff(
    userId: string,
    recommendationId: string,
    treatmentId: string
  ): Promise<string> {
    logger.info('Initiating provider handoff', { userId, treatmentId });

    // 1. Verify User & Recommendation
    const recommendation = await prisma.recommendation.findFirst({
      where: { id: recommendationId, userId },
      include: { healthIntake: true },
    });

    if (!recommendation) {
      throw new NotFoundError('Recommendation');
    }

    // 2. Verify Treatment Match
    const match = await prisma.treatmentMatch.findFirst({
      where: { recommendationId, treatmentId },
      include: { treatment: { include: { provider: true } } },
    });

    if (!match) {
      throw new NotFoundError('Treatment match');
    }

    if (!match.isEligible) {
      // Allow handoff but log warning? Or block?
      logger.warn('Handoff initiated for ineligible treatment', { userId, treatmentId });
    }

    if (!match.treatment.providerId) {
      throw new ValidationError('Selected treatment is not linked to a provider');
    }

    // 3. Prepare Data Package (The "Packet")
    // Decrypt intake
    const intakeData = JSON.parse(
      encryptionService.decrypt(recommendation.healthIntake.intakeDataEncrypted)
    ) as HealthIntakeData;

    // Fetch blood tests if any
    // ... (simplified)

    const handoffPayload: HandoffData = {
      userId,
      intakeData,
      recommendationId,
      selectedTreatmentId: treatmentId,
      consentTimestamp: new Date(),
    };

    // 4. Encrypt for Provider (Simulated)
    // In real world, use Provider's Public Key. Here we use our system key but assume it's for them.
    const handoffDataEncrypted = encryptionService.encrypt(JSON.stringify(handoffPayload));

    // 5. Create Handoff Record & Attribution
    const attributionId = uuidv4();

    const handoff = await prisma.providerHandoff.create({
      data: {
        userId,
        providerId: match.treatment.providerId,
        recommendationId,
        status: 'INITIATED',
        handoffDataEncrypted,
        attributionId,
      },
    });

    // 6. Simulate Sending to Provider (Async usually)
    // We'll just auto-advance state for demo
    await this.simulateProviderReception(handoff.id);

    return handoff.id;
  }

  async getHandoffStatus(handoffId: string, userId: string): Promise<unknown> {
    const handoff = await prisma.providerHandoff.findFirst({
      where: { id: handoffId, userId },
      include: {
        provider: {
          select: { name: true, slug: true },
        },
        attributionEvents: true,
      },
    });

    if (!handoff) {
      throw new NotFoundError('Handoff record');
    }
    return handoff;
  }

  private async simulateProviderReception(handoffId: string): Promise<void> {
    // Simulate delay
    setTimeout(async () => {
      try {
        await prisma.$transaction(async (tx) => {
          const h = await tx.providerHandoff.update({
            where: { id: handoffId },
            data: {
              status: 'PROVIDER_RECEIVED',
              providerReceivedAt: new Date(),
              dataTransferredAt: new Date(),
            },
          });

          // Create attribution event: "Lead Generated"
          await tx.attributionEvent.create({
            data: {
              handoffId: h.id,
              eventType: 'lead_received',
              occurredAt: new Date(),
              metadata: {
                source: 'HealthPilot_Platform',
              },
            },
          });
        });
        logger.info('Simulated provider reception completed', { handoffId });
      } catch (err) {
        logger.error('Provider simulation failed', { handoffId, err });
      }
    }, 2000);
  }
}

export const handoffService = new HandoffService();
export default handoffService;
