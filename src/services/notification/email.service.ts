import logger from '../../utils/logger.js';
import { config } from '../../config/index.js';

// ============================================
// Email Service Interface
// ============================================
export interface IEmailService {
  sendEmail(
    to: string,
    subject: string,
    template: string,
    data: Record<string, unknown>
  ): Promise<boolean>;
}

// ============================================
// Email Service Implementation
// ============================================
export class EmailService implements IEmailService {
  private readonly fromEmail: string;
  private readonly apiKey: string | undefined;

  constructor() {
    this.fromEmail = 'noreply@healthpilot.com'; // Should come from config
    this.apiKey = process.env.SENDGRID_API_KEY; // Or similar provider
  }

  /**
   * Send an email (Mock implementation for now)
   */
  async sendEmail(
    to: string,
    subject: string,
    template: string,
    data: Record<string, unknown>
  ): Promise<boolean> {
    // In a real implementation:
    // 1. Load template
    // 2. Compile with data (Handlebars/EJS)
    // 3. Send via provider (SendGrid, AWS SES)

    logger.info('Sending email', {
      from: this.fromEmail,
      to,
      subject,
      template,
      dataKeys: Object.keys(data),
    });

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (!this.apiKey && config.app.isProduction) {
      logger.warn('Email service not configured in production');
      return false;
    }

    return true;
  }
}

export const emailService = new EmailService();
export default emailService;
