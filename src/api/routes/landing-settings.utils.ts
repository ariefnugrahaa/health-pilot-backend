export type TrustHighlightIcon = 'medical' | 'encrypted' | 'payment';

export interface HeroSection {
  headline: string;
  subtext: string;
}

export interface ServiceCard {
  title: string;
  description: string;
  ctaButtonLabel: string;
  showRecommendedBadge: boolean;
}

export interface InfoBanner {
  enabled: boolean;
  description: string;
}

export interface TrustHighlight {
  icon: TrustHighlightIcon;
  title: string;
  description: string;
}

export interface LandingExperience {
  hero: HeroSection;
  guidedHealthCheck: ServiceCard;
  fullBloodTest: ServiceCard;
  infoBanner: InfoBanner;
  trustHighlights: TrustHighlight[];
}

export interface LandingPageSettings {
  beforeLogin: LandingExperience;
  afterLogin: LandingExperience;
}

const DEFAULT_BEFORE_LOGIN: LandingExperience = {
  hero: {
    headline: 'Get personalised health guidance based on your unique profile',
    subtext:
      'HealthPilot offers tailored insights into your wellbeing. Our system provides guidance only, empowering you with knowledge. No preparation needed. Simply choose your path to begin.',
  },
  guidedHealthCheck: {
    title: 'Start Guided Health Check',
    description:
      'Answer a few questions to receive personalised guidance. You can upload blood test results now or later if available.',
    ctaButtonLabel: 'Get Started',
    showRecommendedBadge: true,
  },
  fullBloodTest: {
    title: 'Full Blood Test Analysis',
    description:
      'Upload an existing blood test or order a new test through HealthPilot, then return to continue your health check.',
    ctaButtonLabel: 'Start Blood Test',
    showRecommendedBadge: true,
  },
  infoBanner: {
    enabled: true,
    description: 'You can begin without any preparation. The system will guide you step by step.',
  },
  trustHighlights: [
    {
      icon: 'medical',
      title: 'Not a medical diagnosis',
      description: 'Guidance only, supporting your health journey.',
    },
    {
      icon: 'encrypted',
      title: 'Private and secure data',
      description: 'Your information is protected with advanced encryption.',
    },
    {
      icon: 'payment',
      title: 'No payment required',
      description: 'Free to begin exploring your personalised health insights.',
    },
  ],
};

const DEFAULT_AFTER_LOGIN: LandingExperience = {
  hero: {
    headline: 'Welcome back to HealthPilot',
    subtext:
      'Based on your last health check, you can continue your journey or start a new one anytime.',
  },
  guidedHealthCheck: {
    title: 'Start Guided Health Check',
    description:
      'Answer a few questions to receive personalised guidance. You can upload blood test results now or later if available.',
    ctaButtonLabel: 'Get Started',
    showRecommendedBadge: true,
  },
  fullBloodTest: {
    title: 'Full Blood Test Analysis',
    description:
      'Upload an existing blood test or order a new test through HealthPilot, then return to continue your health check.',
    ctaButtonLabel: 'Start Blood Test',
    showRecommendedBadge: true,
  },
  infoBanner: {
    enabled: true,
    description: 'You can begin without any preparation. The system will guide you step by step.',
  },
  trustHighlights: [
    {
      icon: 'medical',
      title: 'Not a medical diagnosis',
      description: 'Guidance only, supporting your health journey.',
    },
    {
      icon: 'encrypted',
      title: 'Private and secure data',
      description: 'Your information is protected with advanced encryption.',
    },
    {
      icon: 'payment',
      title: 'No payment required',
      description: 'Free to begin exploring your personalised health insights.',
    },
  ],
};

export const DEFAULT_LANDING_PAGE_SETTINGS: LandingPageSettings = {
  beforeLogin: DEFAULT_BEFORE_LOGIN,
  afterLogin: DEFAULT_AFTER_LOGIN,
};

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function isEmptyObject(value: Record<string, unknown>): boolean {
  return Object.keys(value).length === 0;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asTrustIcon(value: unknown, fallback: TrustHighlightIcon): TrustHighlightIcon {
  return value === 'medical' || value === 'encrypted' || value === 'payment' ? value : fallback;
}

function normalizeLandingExperience(
  input: unknown,
  fallback: LandingExperience
): LandingExperience {
  const raw = asObject(input);

  const heroRaw = asObject(raw.hero);
  const guidedRaw = asObject(raw.guidedHealthCheck);
  const bloodRaw = asObject(raw.fullBloodTest);
  const infoRaw = asObject(raw.infoBanner);
  const trustRaw = Array.isArray(raw.trustHighlights) ? raw.trustHighlights : [];

  return {
    hero: {
      headline: asString(heroRaw.headline, fallback.hero.headline),
      subtext: asString(heroRaw.subtext, fallback.hero.subtext),
    },
    guidedHealthCheck: {
      title: asString(guidedRaw.title, fallback.guidedHealthCheck.title),
      description: asString(guidedRaw.description, fallback.guidedHealthCheck.description),
      ctaButtonLabel: asString(guidedRaw.ctaButtonLabel, fallback.guidedHealthCheck.ctaButtonLabel),
      showRecommendedBadge: asBoolean(
        guidedRaw.showRecommendedBadge,
        fallback.guidedHealthCheck.showRecommendedBadge
      ),
    },
    fullBloodTest: {
      title: asString(bloodRaw.title, fallback.fullBloodTest.title),
      description: asString(bloodRaw.description, fallback.fullBloodTest.description),
      ctaButtonLabel: asString(bloodRaw.ctaButtonLabel, fallback.fullBloodTest.ctaButtonLabel),
      showRecommendedBadge: asBoolean(
        bloodRaw.showRecommendedBadge,
        fallback.fullBloodTest.showRecommendedBadge
      ),
    },
    infoBanner: {
      enabled: asBoolean(infoRaw.enabled, fallback.infoBanner.enabled),
      description: asString(infoRaw.description, fallback.infoBanner.description),
    },
    trustHighlights: fallback.trustHighlights.map((trustFallback, index) => {
      const item = asObject(trustRaw[index]);
      return {
        icon: asTrustIcon(item.icon, trustFallback.icon),
        title: asString(item.title, trustFallback.title),
        description: asString(item.description, trustFallback.description),
      };
    }),
  };
}

export function normalizeLandingPageSettings(input: unknown): LandingPageSettings {
  const raw = asObject(input);

  const beforeRaw = asObject(raw.beforeLogin);
  const afterRaw = asObject(raw.afterLogin);

  // Backward compatibility: old schema used a single shared object at root.
  if (isEmptyObject(beforeRaw) && isEmptyObject(afterRaw)) {
    const legacyBefore = normalizeLandingExperience(raw, DEFAULT_BEFORE_LOGIN);
    const legacyAfter = normalizeLandingExperience(raw, DEFAULT_AFTER_LOGIN);

    return {
      beforeLogin: legacyBefore,
      afterLogin: legacyAfter,
    };
  }

  const beforeFallback = isEmptyObject(beforeRaw)
    ? normalizeLandingExperience(afterRaw, DEFAULT_BEFORE_LOGIN)
    : normalizeLandingExperience(beforeRaw, DEFAULT_BEFORE_LOGIN);

  const afterFallback = isEmptyObject(afterRaw)
    ? normalizeLandingExperience(beforeRaw, DEFAULT_AFTER_LOGIN)
    : normalizeLandingExperience(afterRaw, DEFAULT_AFTER_LOGIN);

  return {
    beforeLogin: beforeFallback,
    afterLogin: afterFallback,
  };
}
