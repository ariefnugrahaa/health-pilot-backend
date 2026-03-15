import { prisma } from '../../utils/database.js';
import type {
  AISolutionPlan,
  RecommendedSolutionCategory,
  RecommendedSolutionProvider,
  RecommendedSolutionSupplement,
  RecommendedSolutionsPayload,
  SolutionCategoryId,
} from '../../types/index.js';
import type { ScoredTreatment } from '../matching/matching.service.js';
import type { SupplementMatchResult } from '../supplement/supplement.service.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaAny = any;

const CATEGORY_LABELS: Record<SolutionCategoryId, string> = {
  LOW_ENERGY: 'Low Energy',
  DIGESTIVE_DISCOMFORT: 'Digestive Discomfort',
  POOR_SLEEP: 'Poor Sleep',
  WEIGHT_MANAGEMENT: 'Weight Management',
};

const CATEGORY_KEYWORDS: Record<SolutionCategoryId, string[]> = {
  LOW_ENERGY: ['energy', 'fatigue', 'tired', 'exhaust', 'focus', 'brain fog', 'motivation', 'burnout'],
  DIGESTIVE_DISCOMFORT: ['digest', 'bloating', 'gut', 'stomach', 'constipation', 'bowel', 'reflux', 'ibs', 'meal'],
  POOR_SLEEP: ['sleep', 'insomnia', 'waking', 'restless', 'night', 'recovery', 'melatonin'],
  WEIGHT_MANAGEMENT: ['weight', 'appetite', 'metabolism', 'fat loss', 'body composition', 'glucose', 'insulin'],
};

const CATEGORY_TREATMENT_HINTS: Record<SolutionCategoryId, string[]> = {
  LOW_ENERGY: ['LONGEVITY', 'GENERAL_WELLNESS', 'COGNITIVE_ENHANCEMENT'],
  DIGESTIVE_DISCOMFORT: ['GENERAL_WELLNESS', 'LONGEVITY'],
  POOR_SLEEP: ['SLEEP_OPTIMIZATION', 'MENTAL_HEALTH', 'GENERAL_WELLNESS'],
  WEIGHT_MANAGEMENT: ['WEIGHT_MANAGEMENT', 'LONGEVITY', 'GENERAL_WELLNESS'],
};

function isSolutionCategoryId(value: string): value is SolutionCategoryId {
  return value in CATEGORY_LABELS;
}

function uniqueCategoryIds(ids: SolutionCategoryId[]): SolutionCategoryId[] {
  return Array.from(new Set(ids));
}

function countKeywordHits(text: string, keywords: string[]): number {
  return keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);
}

function deriveSupplementCategoryIds(match: SupplementMatchResult, focusCategoryIds: SolutionCategoryId[]): SolutionCategoryId[] {
  const sourceText = [
    match.supplement.name,
    match.supplement.description ?? '',
    ...match.supplement.primaryBenefits,
    ...match.supplement.targetSymptoms,
    ...match.supplement.targetGoals,
    ...match.supplement.targetBiomarkers,
    match.matchReason,
    match.expectedBenefit ?? '',
  ]
    .join(' ')
    .toLowerCase();

  return focusCategoryIds.filter((categoryId) => countKeywordHits(sourceText, CATEGORY_KEYWORDS[categoryId]) > 0);
}

function deriveProviderCategoryIds(
  providerText: string,
  treatmentCategory: string,
  focusCategoryIds: SolutionCategoryId[],
): SolutionCategoryId[] {
  return focusCategoryIds.filter((categoryId) => {
    if (countKeywordHits(providerText, CATEGORY_KEYWORDS[categoryId]) > 0) {
      return true;
    }

    return CATEGORY_TREATMENT_HINTS[categoryId].includes(treatmentCategory);
  });
}

export class RecommendedSolutionsService {
  async buildPayload(
    solutionPlan: AISolutionPlan | undefined,
    treatmentMatches: ScoredTreatment[],
    supplementMatches: SupplementMatchResult[],
  ): Promise<RecommendedSolutionsPayload> {
    const fallbackCategoryIds: SolutionCategoryId[] = ['LOW_ENERGY', 'DIGESTIVE_DISCOMFORT', 'POOR_SLEEP'];
    const aiCategoryIds = (solutionPlan?.focusCategories ?? [])
      .map((category) => category.id)
      .filter(isSolutionCategoryId);
    const focusCategoryIds = uniqueCategoryIds(
      aiCategoryIds.length > 0 ? aiCategoryIds : fallbackCategoryIds,
    );

    const treatmentIds = treatmentMatches.map((match) => match.treatment.id);
    const treatmentDetails = treatmentIds.length > 0
      ? await (prisma as PrismaAny).treatment.findMany({
        where: { id: { in: treatmentIds } },
        include: {
          provider: true,
          treatmentProviders: {
            include: {
              provider: true,
            },
          },
        },
      }) as Array<{
        id: string;
        name: string;
        description?: string | null;
        category: string;
        provider?: {
          id: string;
          name: string;
          slug: string;
          description?: string | null;
          websiteUrl?: string | null;
          logoUrl?: string | null;
          supportedRegions: string[];
          category?: string | null;
        } | null;
        treatmentProviders: Array<{
          provider: {
            id: string;
            name: string;
            slug: string;
            description?: string | null;
            websiteUrl?: string | null;
            logoUrl?: string | null;
            supportedRegions: string[];
            category?: string | null;
          };
        }>;
      }>
      : [];

    const treatmentDetailMap = new Map(treatmentDetails.map((treatment) => [treatment.id, treatment]));

    const providerAggregation = new Map<string, RecommendedSolutionProvider>();

    for (const match of treatmentMatches) {
      const detail = treatmentDetailMap.get(match.treatment.id);
      if (!detail) {
        continue;
      }

      const providers = [
        ...(detail.provider ? [detail.provider] : []),
        ...detail.treatmentProviders.map((link) => link.provider),
      ].filter((provider, index, list) => list.findIndex((entry) => entry.id === provider.id) === index);

      for (const provider of providers) {
        const providerText = [
          provider.name,
          provider.description ?? '',
          provider.category ?? '',
          detail.name,
          detail.description ?? '',
          detail.category,
        ].join(' ').toLowerCase();

        const matchedCategoryIds = deriveProviderCategoryIds(providerText, detail.category, focusCategoryIds);

        if (matchedCategoryIds.length === 0) {
          continue;
        }

        const existing = providerAggregation.get(provider.id);
        const nextScore = Math.max(
          1,
          Math.round(match.score * 100) + matchedCategoryIds.length * 12,
        );

        if (!existing) {
          providerAggregation.set(provider.id, {
            providerId: provider.id,
            providerName: provider.name,
            providerSlug: provider.slug,
            supportedRegions: provider.supportedRegions,
            matchedCategoryIds,
            matchScore: nextScore,
            matchedTreatments: [
              {
                treatmentId: detail.id,
                treatmentName: detail.name,
                treatmentCategory: detail.category,
                matchReasons: match.matchReasons,
              },
            ],
            ...(provider.description ? { providerDescription: provider.description } : {}),
            ...(provider.websiteUrl ? { providerWebsiteUrl: provider.websiteUrl } : {}),
            ...(provider.logoUrl ? { providerLogoUrl: provider.logoUrl } : {}),
          });
          continue;
        }

        existing.matchScore += nextScore;
        existing.matchedCategoryIds = uniqueCategoryIds([
          ...existing.matchedCategoryIds,
          ...matchedCategoryIds,
        ]);

        const alreadyTracked = existing.matchedTreatments.some((treatment) => treatment.treatmentId === detail.id);
        if (!alreadyTracked) {
          existing.matchedTreatments.push({
            treatmentId: detail.id,
            treatmentName: detail.name,
            treatmentCategory: detail.category,
            matchReasons: match.matchReasons,
          });
        }
      }
    }

    const providerMatches = Array.from(providerAggregation.values())
      .sort((left, right) => right.matchScore - left.matchScore);

    const supplementResults: RecommendedSolutionSupplement[] = supplementMatches
      .map((match) => {
        const matchedCategoryIds = deriveSupplementCategoryIds(match, focusCategoryIds);
        return {
          supplementId: match.supplement.id,
          name: match.supplement.name,
          slug: match.supplement.slug,
          category: match.supplement.category,
          currency: match.supplement.currency,
          primaryBenefits: match.supplement.primaryBenefits,
          matchedCategoryIds,
          matchScore: match.matchScore,
          ...(match.supplement.description ? { description: match.supplement.description } : {}),
          ...(match.supplement.evidenceLevel ? { evidenceLevel: match.supplement.evidenceLevel } : {}),
          ...(typeof match.supplement.averagePrice === 'number' ? { averagePrice: match.supplement.averagePrice } : {}),
          ...(match.matchReason ? { matchReason: match.matchReason } : {}),
          ...(match.expectedBenefit ? { expectedBenefit: match.expectedBenefit } : {}),
        };
      })
      .filter((match) => match.matchedCategoryIds.length > 0)
      .sort((left, right) => right.matchScore - left.matchScore);

    const symptomCategories: RecommendedSolutionCategory[] = focusCategoryIds.map((categoryId) => ({
      id: categoryId,
      label: CATEGORY_LABELS[categoryId],
      providerCount: providerMatches.filter((match) => match.matchedCategoryIds.includes(categoryId)).length,
      supplementCount: supplementResults.filter((match) => match.matchedCategoryIds.includes(categoryId)).length,
    }));

    const fallbackFocusCategories = symptomCategories.map((category) => ({
      id: category.id,
      label: category.label,
      reason: `Matched against currently available solutions for ${category.label.toLowerCase()}.`,
    }));
    const sanitizedFocusCategories = (solutionPlan?.focusCategories ?? [])
      .filter((category) => isSolutionCategoryId(category.id))
      .map((category) => ({
        ...category,
        label: category.label || CATEGORY_LABELS[category.id],
      }));

    const finalPlan: AISolutionPlan = solutionPlan
      ? {
          ...solutionPlan,
          focusCategories:
            sanitizedFocusCategories.length > 0
              ? sanitizedFocusCategories
              : fallbackFocusCategories,
        }
      : {
          strategyTitle: 'Personalised Health Optimisation Plan',
          strategySummary: 'This plan combines the strongest category signals from your intake with the currently available provider and supplement catalogue.',
          whyThisPlan: [
            'Your intake showed a clear pattern across the selected focus areas.',
            'The catalogue was filtered to providers and supplements that currently align with those areas.',
          ],
          focusCategories: fallbackFocusCategories,
        };

    return {
      solutionPlan: finalPlan,
      providerMatches,
      supplementMatches: supplementResults,
      symptomCategories,
    };
  }
}

export const recommendedSolutionsService = new RecommendedSolutionsService();
