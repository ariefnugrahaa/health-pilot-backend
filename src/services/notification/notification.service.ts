import logger from '../../utils/logger.js';
import { prisma } from '../../utils/database.js';
import type { Prisma } from '@prisma/client';
import { config } from '../../config/index.js';

// ============================================
// Types
// ============================================

export type NotificationChannel = 'email' | 'push' | 'sms' | 'in_app';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface NotificationPayload {
  userId: string;
  channel: NotificationChannel;
  type: string;
  subject?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: NotificationPriority;
  scheduledFor?: Date;
}

export interface EmailPayload {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
}

export interface NotificationResult {
  success: boolean;
  notificationId?: string;
  externalId?: string;
  error?: string;
}

// ============================================
// Notification Templates
// ============================================

const EMAIL_TEMPLATES = {
  WELCOME: {
    subject: 'Welcome to HealthPilot',
    template: (data: { firstName?: string }) => `
            <h1>Welcome to HealthPilot!</h1>
            <p>Hi ${data.firstName || 'there'},</p>
            <p>Thank you for joining HealthPilot. We're excited to help you on your health journey.</p>
            <p>Get started by completing your health intake to receive personalized recommendations.</p>
            <a href="${config.app.frontendUrl}/intake" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Start Your Health Intake</a>
            <p>Best regards,<br>The HealthPilot Team</p>
        `,
  },
  RECOMMENDATION_READY: {
    subject: 'Your Health Recommendations Are Ready',
    template: (data: { firstName?: string; recommendationId: string }) => `
            <h1>Your Personalized Recommendations</h1>
            <p>Hi ${data.firstName || 'there'},</p>
            <p>Great news! We've analyzed your health information and prepared personalized treatment recommendations for you.</p>
            <a href="${config.app.frontendUrl}/recommendations/${data.recommendationId}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Your Recommendations</a>
            <p>Remember, these recommendations are educational and not medical advice. Please consult with a healthcare provider before starting any treatment.</p>
            <p>Best regards,<br>The HealthPilot Team</p>
        `,
  },
  BLOOD_TEST_RESULTS: {
    subject: 'Your Blood Test Results Are In',
    template: (data: { firstName?: string; testId: string }) => `
            <h1>Blood Test Results Available</h1>
            <p>Hi ${data.firstName || 'there'},</p>
            <p>Your blood test results have been processed and are now available for review.</p>
            <a href="${config.app.frontendUrl}/blood-tests/${data.testId}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Your Results</a>
            <p>We've prepared a detailed interpretation of your biomarkers to help you understand what they mean for your health.</p>
            <p>Best regards,<br>The HealthPilot Team</p>
        `,
  },
  HANDOFF_INITIATED: {
    subject: 'Your Provider Referral Has Been Sent',
    template: (data: { firstName?: string; providerName: string; treatmentName: string }) => `
            <h1>Provider Referral Initiated</h1>
            <p>Hi ${data.firstName || 'there'},</p>
            <p>Your referral to <strong>${data.providerName}</strong> for <strong>${data.treatmentName}</strong> has been submitted.</p>
            <p>What happens next:</p>
            <ol>
                <li>The provider will review your health information</li>
                <li>You'll receive confirmation from the provider directly</li>
                <li>If eligible, the provider will guide you through next steps</li>
            </ol>
            <p>Best regards,<br>The HealthPilot Team</p>
        `,
  },
  PROVIDER_ACCEPTED: {
    subject: 'Provider Has Accepted Your Referral',
    template: (data: { firstName?: string; providerName: string; nextSteps: string }) => `
            <h1>Great News!</h1>
            <p>Hi ${data.firstName || 'there'},</p>
            <p><strong>${data.providerName}</strong> has reviewed your referral and confirmed your eligibility.</p>
            <p><strong>Next Steps:</strong></p>
            <p>${data.nextSteps}</p>
            <p>Best regards,<br>The HealthPilot Team</p>
        `,
  },
  INTAKE_REMINDER: {
    subject: 'Complete Your Health Intake',
    template: (data: { firstName?: string }) => `
            <h1>Don't Forget to Complete Your Intake</h1>
            <p>Hi ${data.firstName || 'there'},</p>
            <p>You started your health intake but haven't completed it yet. Complete it now to receive your personalized recommendations.</p>
            <a href="${config.app.frontendUrl}/intake" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Continue Your Intake</a>
            <p>Best regards,<br>The HealthPilot Team</p>
        `,
  },
} as const;

// ============================================
// Notification Service Interface
// ============================================

export interface INotificationService {
  send(payload: NotificationPayload): Promise<NotificationResult>;
  sendEmail(
    email: string,
    templateId: keyof typeof EMAIL_TEMPLATES,
    data: Record<string, unknown>
  ): Promise<NotificationResult>;
  sendBulk(payloads: NotificationPayload[]): Promise<NotificationResult[]>;
  scheduleNotification(payload: NotificationPayload, sendAt: Date): Promise<string>;
  cancelScheduledNotification(notificationId: string): Promise<boolean>;
  getUserNotifications(userId: string, limit?: number): Promise<unknown[]>;
  markAsRead(notificationId: string, userId: string): Promise<void>;
}

// ============================================
// Notification Service Implementation
// ============================================

export class NotificationService implements INotificationService {
  /**
   * Send a notification through the specified channel
   */
  async send(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      logger.info('Sending notification', {
        userId: payload.userId,
        channel: payload.channel,
        type: payload.type,
      });

      // Store notification in database for tracking
      const notification = await prisma.notification.create({
        data: {
          userId: payload.userId,
          channel: payload.channel,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          data: (payload.data as unknown as Prisma.InputJsonValue) ?? null,
          priority: payload.priority ?? 'normal',
          status: 'PENDING',
          scheduledFor: payload.scheduledFor ?? null,
        },
      });

      // Route to appropriate channel handler
      let result: NotificationResult;
      switch (payload.channel) {
        case 'email':
          result = await this.sendEmailNotification(payload);
          break;
        case 'push':
          result = await this.sendPushNotification(payload);
          break;
        case 'sms':
          result = await this.sendSmsNotification(payload);
          break;
        case 'in_app':
          result = { success: true, notificationId: notification.id };
          break;
        default:
          result = { success: false, error: 'Unknown channel' };
      }

      // Update notification status
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: result.success ? 'SENT' : 'FAILED',
          sentAt: result.success ? new Date() : null,
          externalId: result.externalId ?? null,
          errorMessage: result.error ?? null,
        },
      });

      return { ...result, notificationId: notification.id };
    } catch (error) {
      logger.error('Failed to send notification', { error, payload });
      return { success: false, error: 'Failed to send notification' };
    }
  }

  /**
   * Send email using template
   */
  async sendEmail(
    email: string,
    templateId: keyof typeof EMAIL_TEMPLATES,
    data: Record<string, unknown>
  ): Promise<NotificationResult> {
    const template = EMAIL_TEMPLATES[templateId];
    if (!template) {
      return { success: false, error: 'Unknown template' };
    }

    const htmlBody = template.template(data as never);

    return this.sendEmailDirect({
      to: email,
      subject: template.subject,
      htmlBody,
    });
  }

  /**
   * Send bulk notifications
   */
  async sendBulk(payloads: NotificationPayload[]): Promise<NotificationResult[]> {
    const results = await Promise.all(payloads.map((payload) => this.send(payload)));
    return results;
  }

  /**
   * Schedule a notification for later
   */
  async scheduleNotification(payload: NotificationPayload, sendAt: Date): Promise<string> {
    const notification = await prisma.notification.create({
      data: {
        userId: payload.userId,
        channel: payload.channel,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: (payload.data as unknown as Prisma.InputJsonValue) ?? null,
        priority: payload.priority ?? 'normal',
        status: 'SCHEDULED',
        scheduledFor: sendAt,
      },
    });

    logger.info('Notification scheduled', {
      notificationId: notification.id,
      sendAt,
    });

    return notification.id;
  }

  /**
   * Cancel a scheduled notification
   */
  async cancelScheduledNotification(notificationId: string): Promise<boolean> {
    try {
      await prisma.notification.update({
        where: { id: notificationId, status: 'SCHEDULED' },
        data: { status: 'CANCELLED' },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get user's notifications
   */
  async getUserNotifications(userId: string, limit: number = 50): Promise<unknown[]> {
    return prisma.notification.findMany({
      where: {
        userId,
        channel: 'in_app',
        status: { in: ['SENT', 'PENDING'] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await prisma.notification.update({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
  }

  // ============================================
  // Private Channel Handlers
  // ============================================

  private async sendEmailNotification(payload: NotificationPayload): Promise<NotificationResult> {
    // Get user email
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true },
    });

    if (!user?.email) {
      return { success: false, error: 'User has no email' };
    }

    return this.sendEmailDirect({
      to: user.email,
      subject: payload.subject ?? payload.title,
      htmlBody: `<h1>${payload.title}</h1><p>${payload.body}</p>`,
    });
  }

  private async sendEmailDirect(emailPayload: EmailPayload): Promise<NotificationResult> {
    // In production, integrate with email provider (SendGrid, SES, etc.)
    // For now, log the email and simulate success

    logger.info('Sending email', {
      to: emailPayload.to,
      subject: emailPayload.subject,
    });

    // Simulate email sending
    // In production, replace with actual email provider integration:
    //
    // Example with SendGrid:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(config.email.sendgridApiKey);
    // const msg = {
    //     to: emailPayload.to,
    //     from: config.email.fromAddress,
    //     subject: emailPayload.subject,
    //     html: emailPayload.htmlBody,
    //     text: emailPayload.textBody ?? '',
    // };
    // await sgMail.send(msg);

    // Simulate success (in production, return actual result)
    return {
      success: true,
      externalId: `email_${Date.now()}`,
    };
  }

  private async sendPushNotification(payload: NotificationPayload): Promise<NotificationResult> {
    // In production, integrate with push notification provider (Firebase, OneSignal, etc.)
    // For now, log and simulate success

    logger.info('Sending push notification', {
      userId: payload.userId,
      title: payload.title,
    });

    // Simulate success
    return {
      success: true,
      externalId: `push_${Date.now()}`,
    };
  }

  private async sendSmsNotification(payload: NotificationPayload): Promise<NotificationResult> {
    // In production, integrate with SMS provider (Twilio, etc.)
    // For now, log and simulate success

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { phoneNumber: true },
    });

    if (!user?.phoneNumber) {
      return { success: false, error: 'User has no phone number' };
    }

    logger.info('Sending SMS', {
      to: user.phoneNumber,
      body: payload.body.substring(0, 160),
    });

    // Simulate success
    return {
      success: true,
      externalId: `sms_${Date.now()}`,
    };
  }
}

// ============================================
// Convenience Functions for Common Notifications
// ============================================

export async function sendWelcomeEmail(userId: string): Promise<NotificationResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true },
  });

  if (!user?.email) {
    return { success: false, error: 'User has no email' };
  }

  return notificationService.sendEmail(user.email, 'WELCOME', {
    firstName: user.firstName,
  });
}

export async function sendRecommendationReadyNotification(
  userId: string,
  recommendationId: string
): Promise<NotificationResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true },
  });

  if (!user?.email) {
    return { success: false, error: 'User has no email' };
  }

  return notificationService.sendEmail(user.email, 'RECOMMENDATION_READY', {
    firstName: user.firstName,
    recommendationId,
  });
}

export async function sendBloodTestResultsNotification(
  userId: string,
  testId: string
): Promise<NotificationResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true },
  });

  if (!user?.email) {
    return { success: false, error: 'User has no email' };
  }

  return notificationService.sendEmail(user.email, 'BLOOD_TEST_RESULTS', {
    firstName: user.firstName,
    testId,
  });
}

export async function sendHandoffNotification(
  userId: string,
  providerName: string,
  treatmentName: string
): Promise<NotificationResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true },
  });

  if (!user?.email) {
    return { success: false, error: 'User has no email' };
  }

  return notificationService.sendEmail(user.email, 'HANDOFF_INITIATED', {
    firstName: user.firstName,
    providerName,
    treatmentName,
  });
}

// ============================================
// Singleton Instance
// ============================================

export const notificationService = new NotificationService();
export default notificationService;
