import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';

// ============================================
// Cloudflare Service Interface (SOLID - ISP)
// ============================================
export interface ICloudflareService {
  purgeCache(urls: string[]): Promise<boolean>;
  purgeAllCache(): Promise<boolean>;
  getAnalytics(since: Date, until: Date): Promise<CloudflareAnalytics>;
}

export interface CloudflareAnalytics {
  requests: number;
  bandwidth: number;
  threats: number;
  pageViews: number;
}

// ============================================
// Cloudflare API Response Types
// ============================================
interface CloudflareApiResponse<T> {
  success: boolean;
  errors: CloudflareError[];
  messages: string[];
  result: T;
}

interface CloudflareError {
  code: number;
  message: string;
}

interface CloudflarePurgeResult {
  id: string;
}

interface CloudflareAnalyticsResult {
  totals: {
    requests: { all: number };
    bandwidth: { all: number };
    threats: { all: number };
    pageviews: { all: number };
  };
}

// ============================================
// Cloudflare Service Implementation
// ============================================
export class CloudflareService implements ICloudflareService {
  private readonly baseUrl = 'https://api.cloudflare.com/client/v4';
  private readonly apiToken: string | undefined;
  private readonly zoneId: string | undefined;

  constructor() {
    this.apiToken = config.cloudflare.apiToken;
    this.zoneId = config.cloudflare.zoneId;

    if (!this.apiToken) {
      logger.warn('Cloudflare API token not configured - Cloudflare features will be disabled');
    }
  }

  /**
   * Check if Cloudflare is configured
   */
  private isConfigured(): boolean {
    return Boolean(this.apiToken && this.zoneId);
  }

  /**
   * Make authenticated request to Cloudflare API
   */
  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    body?: Record<string, unknown>
  ): Promise<CloudflareApiResponse<T>> {
    if (!this.isConfigured()) {
      throw new Error('Cloudflare is not configured');
    }

    const url = `${this.baseUrl}${endpoint}`;

    const response = await globalThis.fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: (body ? JSON.stringify(body) : null) as any,
    });

    const data = (await response.json()) as CloudflareApiResponse<T>;

    if (!data.success) {
      const errorMessages = data.errors.map((e) => e.message).join(', ');
      throw new Error(`Cloudflare API error: ${errorMessages}`);
    }

    return data;
  }

  /**
   * Purge specific URLs from cache
   */
  async purgeCache(urls: string[]): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.warn('Cloudflare not configured, skipping cache purge');
      return false;
    }

    try {
      await this.makeRequest<CloudflarePurgeResult>(`/zones/${this.zoneId}/purge_cache`, 'POST', {
        files: urls,
      });

      logger.info('Cloudflare cache purged', { urls: urls.length });
      return true;
    } catch (error) {
      logger.error('Failed to purge Cloudflare cache', { error });
      return false;
    }
  }

  /**
   * Purge all cache for the zone
   */
  async purgeAllCache(): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.warn('Cloudflare not configured, skipping cache purge');
      return false;
    }

    try {
      await this.makeRequest<CloudflarePurgeResult>(`/zones/${this.zoneId}/purge_cache`, 'POST', {
        purge_everything: true,
      });

      logger.info('Cloudflare cache fully purged');
      return true;
    } catch (error) {
      logger.error('Failed to purge all Cloudflare cache', { error });
      return false;
    }
  }

  /**
   * Get analytics for the zone
   */
  async getAnalytics(since: Date, until: Date): Promise<CloudflareAnalytics> {
    if (!this.isConfigured()) {
      logger.warn('Cloudflare not configured, returning empty analytics');
      return {
        requests: 0,
        bandwidth: 0,
        threats: 0,
        pageViews: 0,
      };
    }

    try {
      const sinceStr = since.toISOString();
      const untilStr = until.toISOString();

      const response = await this.makeRequest<CloudflareAnalyticsResult>(
        `/zones/${this.zoneId}/analytics/dashboard?since=${sinceStr}&until=${untilStr}`
      );

      return {
        requests: response.result.totals.requests.all,
        bandwidth: response.result.totals.bandwidth.all,
        threats: response.result.totals.threats.all,
        pageViews: response.result.totals.pageviews.all,
      };
    } catch (error) {
      logger.error('Failed to get Cloudflare analytics', { error });
      return {
        requests: 0,
        bandwidth: 0,
        threats: 0,
        pageViews: 0,
      };
    }
  }

  /**
   * Verify Cloudflare Turnstile token (CAPTCHA alternative)
   */
  async verifyTurnstileToken(token: string, ip?: string): Promise<boolean> {
    try {
      const response = await globalThis.fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            secret: this.apiToken,
            response: token,
            remoteip: ip,
          }),
        }
      );

      const data = (await response.json()) as { success: boolean };
      return data.success;
    } catch (error) {
      logger.error('Failed to verify Turnstile token', { error });
      return false;
    }
  }
}

// ============================================
// Singleton Instance
// ============================================
export const cloudflareService = new CloudflareService();
export default cloudflareService;
