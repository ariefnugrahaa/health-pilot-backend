import type {
  AIAnalysisResponse,
  BloodEnhancedStructuredSummary,
  BloodTestResult,
  HealthIntakeData,
  IntakeScoringContext,
  StructuredSummaryBiomarker,
} from '../../types/index.js';

type BloodTestSource = 'upload' | 'order';

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function titleCaseFromKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPrimitive(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.replace(/_/g, ' ') : null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}

function formatResponseValue(value: unknown): string | null {
  const primitive = formatPrimitive(value);
  if (primitive) {
    return primitive;
  }

  if (Array.isArray(value)) {
    const flattened = value
      .map((item) => formatResponseValue(item))
      .filter((item): item is string => Boolean(item));

    return flattened.length > 0 ? flattened.join(', ') : null;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, nestedValue]) => {
        const formatted = formatResponseValue(nestedValue);
        if (!formatted) {
          return null;
        }

        return `${titleCaseFromKey(key)}: ${formatted}`;
      })
      .filter((entry): entry is string => Boolean(entry));

    return entries.length > 0 ? entries.join('; ') : null;
  }

  return null;
}

function getBloodTestSource(intakeData: HealthIntakeData): BloodTestSource {
  return intakeData.rawResponses?.bloodTestSource === 'upload' ? 'upload' : 'order';
}

function getDefaultPlainLanguageSummary(source: BloodTestSource): string[] {
  return source === 'order'
    ? [
        'Your detailed intake and HealthPilot blood test results were reviewed together to identify the strongest health patterns.',
        'This combined summary compares what you reported with the biomarkers in your test so you can focus on the most relevant next steps.',
      ]
    : ['Your intake responses and blood test results were combined to create this summary.'];
}

function getDefaultResponseSignal(source: BloodTestSource): string {
  return source === 'order'
    ? 'Your detailed intake responses were compared against your ordered blood test results to identify the clearest patterns.'
    : 'The intake did not include enough detail to build more personalized response signals.';
}

function getDefaultMeaning(source: BloodTestSource): string[] {
  return source === 'order'
    ? [
        'Comparing your intake answers with these biomarkers helps highlight which symptoms, habits, or goals may be most relevant right now.',
      ]
    : ['These results are educational and should be interpreted alongside symptoms, history, and clinical context.'];
}

function buildScoringSignalGroup(
  intakeScoring?: IntakeScoringContext,
): BloodEnhancedStructuredSummary['responseSignals'][number] | null {
  if (!intakeScoring) {
    return null;
  }

  const items: string[] = [];

  if (intakeScoring.mappedHeadline?.headline) {
    items.push(intakeScoring.mappedHeadline.headline);
  }

  items.push(...(intakeScoring.summarySignals ?? []).slice(0, 3));

  if (intakeScoring.mappedTagInsights?.length) {
    items.push(...intakeScoring.mappedTagInsights.slice(0, 2));
  }

  if (items.length === 0) {
    return null;
  }

  return {
    title: 'From scoring and admin rules',
    items: items.slice(0, 4),
  };
}

function getDefaultLimitations(): string[] {
  return [
    'This summary is educational only and is not a diagnosis.',
    'Lab interpretation can change when a clinician reviews your full history and the original report.',
  ];
}

function normalizeStructuredSummary(
  summary: BloodEnhancedStructuredSummary,
  source: BloodTestSource,
): BloodEnhancedStructuredSummary {
  const plainLanguageSummary = (summary.plainLanguageSummary ?? []).filter(Boolean);
  const responseSignals = (summary.responseSignals ?? []).filter((group) => group.items.length > 0);
  const whatThisMayMean = (summary.whatThisMayMean ?? []).filter(Boolean);
  const limitationsAndBoundaries = (summary.limitationsAndBoundaries ?? []).filter(Boolean);

  return {
    plainLanguageSummary:
      plainLanguageSummary.length > 0
        ? plainLanguageSummary
        : getDefaultPlainLanguageSummary(source),
    responseSignals:
      responseSignals.length > 0
        ? responseSignals
        : [
            {
              title: 'From your responses',
              items: [getDefaultResponseSignal(source)],
            },
          ],
    bloodTestSignals: summary.bloodTestSignals ?? [],
    whatThisMayMean:
      whatThisMayMean.length > 0 ? whatThisMayMean : getDefaultMeaning(source),
    limitationsAndBoundaries:
      limitationsAndBoundaries.length > 0
        ? limitationsAndBoundaries
        : getDefaultLimitations(),
    nextActionLabel: summary.nextActionLabel?.trim() || 'View personalized recommendations',
  };
}

function buildResponseSignals(intakeData: HealthIntakeData, aiResponse: AIAnalysisResponse): string[] {
  const rawResponses = intakeData.rawResponses;
  const ignoredKeys = new Set([
    'bloodTestId',
    'bloodTestSource',
    'intakeAssignment',
    'recent_labs_available',
    'lab_source',
    'last_lab_timing',
  ]);

  const responseSignals: string[] = [];

  if (rawResponses) {
    for (const [key, value] of Object.entries(rawResponses)) {
      if (ignoredKeys.has(key)) {
        continue;
      }

      const formattedValue = formatResponseValue(value);
      if (!formattedValue) {
        continue;
      }

      responseSignals.push(`${titleCaseFromKey(key)}: ${formattedValue}.`);
      if (responseSignals.length >= 4) {
        break;
      }
    }
  }

  if (responseSignals.length === 0 && aiResponse.recommendations.length > 0) {
    return aiResponse.recommendations.slice(0, 3);
  }

  return responseSignals;
}

function getBiomarkerStatus(
  value: number,
  referenceMin?: number,
  referenceMax?: number,
): StructuredSummaryBiomarker['status'] {
  if (typeof referenceMin === 'number' && value < referenceMin) {
    return 'SLIGHTLY_LOW';
  }

  if (typeof referenceMax === 'number' && value > referenceMax) {
    return 'SLIGHTLY_HIGH';
  }

  return 'IN_RANGE';
}

function formatReferenceRange(referenceMin?: number, referenceMax?: number): string {
  if (typeof referenceMin === 'number' && typeof referenceMax === 'number') {
    return `${referenceMin} - ${referenceMax}`;
  }

  if (typeof referenceMin === 'number') {
    return `>= ${referenceMin}`;
  }

  if (typeof referenceMax === 'number') {
    return `<= ${referenceMax}`;
  }

  return 'Not provided';
}

function describeBiomarker(result: BloodTestResult, status: StructuredSummaryBiomarker['status']): string {
  const name = result.biomarkerName ?? titleCaseFromKey(result.biomarkerCode);
  if (status === 'SLIGHTLY_HIGH') {
    return `${name} is above the stated reference range and may be worth follow-up with your clinician.`;
  }

  if (status === 'SLIGHTLY_LOW') {
    return `${name} is below the stated reference range and may help explain some of your current symptoms.`;
  }

  return `${name} sits within the stated reference range in this report.`;
}

function buildBloodSignals(results: BloodTestResult[]): StructuredSummaryBiomarker[] {
  return results
    .map((result) => {
      const status = getBiomarkerStatus(result.value, result.referenceMin, result.referenceMax);
      return {
        biomarkerCode: result.biomarkerCode,
        displayName: result.biomarkerName ?? titleCaseFromKey(result.biomarkerCode),
        value: result.value,
        unit: result.unit,
        referenceRange: formatReferenceRange(result.referenceMin, result.referenceMax),
        status,
        detail: describeBiomarker(result, status),
      };
    })
    .sort((left, right) => {
      if (left.status === 'IN_RANGE' && right.status !== 'IN_RANGE') {
        return 1;
      }

      if (left.status !== 'IN_RANGE' && right.status === 'IN_RANGE') {
        return -1;
      }

      return left.displayName.localeCompare(right.displayName);
    })
    .slice(0, 4);
}

export function buildBloodEnhancedStructuredSummary(
  aiResponse: AIAnalysisResponse,
  intakeData: HealthIntakeData,
  bloodTestResults: BloodTestResult[],
  intakeScoring?: IntakeScoringContext,
): BloodEnhancedStructuredSummary {
  const bloodTestSource = getBloodTestSource(intakeData);

  if (aiResponse.structuredSummary) {
    return normalizeStructuredSummary(aiResponse.structuredSummary, bloodTestSource);
  }

  const summaryParagraphs = splitIntoParagraphs(aiResponse.healthSummary);
  const responseSignals = buildResponseSignals(intakeData, aiResponse);
  const scoringSignalGroup = buildScoringSignalGroup(intakeScoring);
  const bloodTestSignals = buildBloodSignals(bloodTestResults);
  const aiMeaning = aiResponse.recommendations.flatMap((recommendation) =>
    splitIntoSentences(recommendation),
  );
  const warningMeaning = aiResponse.warnings.flatMap((warning) => splitIntoSentences(warning));
  const mappedMeaning = [
    intakeScoring?.mappedHeadline?.summary,
    ...(intakeScoring?.mappedTagInsights ?? []),
  ].filter((item): item is string => Boolean(item));

  return normalizeStructuredSummary({
    plainLanguageSummary:
      summaryParagraphs.length > 0
        ? summaryParagraphs
        : getDefaultPlainLanguageSummary(bloodTestSource),
    responseSignals: [
      {
        title: 'From your responses',
        items:
          responseSignals.length > 0
            ? responseSignals
            : [getDefaultResponseSignal(bloodTestSource)],
      },
      ...(scoringSignalGroup ? [scoringSignalGroup] : []),
    ],
    bloodTestSignals,
    whatThisMayMean:
      [...mappedMeaning, ...aiMeaning, ...warningMeaning].slice(0, 3).length > 0
        ? [...mappedMeaning, ...aiMeaning, ...warningMeaning].slice(0, 3)
        : getDefaultMeaning(bloodTestSource),
    limitationsAndBoundaries: aiResponse.warnings.length > 0
      ? [
          ...aiResponse.warnings,
          ...getDefaultLimitations(),
        ].slice(0, 4)
      : getDefaultLimitations(),
    nextActionLabel: 'View personalized recommendations',
  }, bloodTestSource);
}
