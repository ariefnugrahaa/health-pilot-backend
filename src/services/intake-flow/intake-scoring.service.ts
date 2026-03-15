import type {
  BloodTestResult,
  HealthIntakeData,
  IntakeScoringContext,
  IntakeScoringDomainResult,
  IntakeScoringRiskBucket,
} from '../../types/index.js';
import type { IntakeFlowScoringConfig } from './intake-flow.service.js';

const COMPREHENSIVE_MEDICAL_INTAKE = 'Comprehensive Medical Intake';
const BLOOD_ENHANCED_INTAKE = 'Blood-Enhanced Intake';

type DomainAccumulator = {
  id: string;
  name: string;
  weight: number;
  rawScore: number;
  evidence: Set<string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStringValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getStringArrayValue(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getNumericValue(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function addScore(
  domains: Map<string, DomainAccumulator>,
  domainId: string,
  points: number,
  evidence: string,
): void {
  if (points <= 0) {
    return;
  }

  const domain = domains.get(domainId);
  if (!domain) {
    return;
  }

  domain.rawScore += points;
  if (evidence.trim().length > 0) {
    domain.evidence.add(evidence.trim());
  }
}

function compareValues(currentValue: number, operator: string, expectedValue: number): boolean {
  switch (operator) {
    case '>':
      return currentValue > expectedValue;
    case '>=':
      return currentValue >= expectedValue;
    case '<':
      return currentValue < expectedValue;
    case '<=':
      return currentValue <= expectedValue;
    case '=':
      return currentValue === expectedValue;
    default:
      return false;
  }
}

function applyBloodMarkerRules(
  config: IntakeFlowScoringConfig,
  bloodTestResults: BloodTestResult[],
  domains: Map<string, DomainAccumulator>,
): void {
  if (!config.bloodMarkerRules?.length || bloodTestResults.length === 0) {
    return;
  }

  for (const rule of config.bloodMarkerRules) {
    const normalizedRuleMarker = normalizeBiomarkerCode(rule.marker);
    const result = bloodTestResults.find(
      (item) => normalizeBiomarkerCode(item.biomarkerCode) === normalizedRuleMarker,
    );
    if (!result || !compareValues(result.value, rule.operator, rule.value)) {
      continue;
    }

    const domain = domains.get(rule.targetDomainId);
    if (!domain) {
      continue;
    }

    if (rule.actionType === 'SET') {
      domain.rawScore = rule.scoreModifier;
    } else if (rule.actionType === 'SUBTRACT') {
      domain.rawScore = Math.max(0, domain.rawScore - rule.scoreModifier);
    } else {
      domain.rawScore += rule.scoreModifier;
    }

    domain.evidence.add(
      `${result.biomarkerName ?? result.biomarkerCode} matched blood-marker scoring rule.`,
    );
  }
}

function applyComprehensiveMedicalIntakeHeuristics(
  rawResponses: Record<string, unknown>,
  domains: Map<string, DomainAccumulator>,
): void {
  const careFocus = getStringValue(rawResponses, 'care_focus');
  if (careFocus && domains.has(careFocus)) {
    addScore(domains, careFocus, 3, `Primary focus selected: ${careFocus}.`);
  }

  const dominantSymptoms = new Set(getStringArrayValue(rawResponses, 'dominant_symptoms'));
  if (dominantSymptoms.has('fatigue')) {
    addScore(domains, 'hormonal', 2, 'Fatigue reported as a dominant symptom.');
    addScore(domains, 'metabolic', 1, 'Fatigue may overlap with metabolic concerns.');
  }
  if (dominantSymptoms.has('cravings')) {
    addScore(domains, 'metabolic', 2, 'Sugar or carb cravings reported.');
  }
  if (dominantSymptoms.has('poor_recovery')) {
    addScore(domains, 'hormonal', 2, 'Poor exercise recovery reported.');
  }
  if (dominantSymptoms.has('palpitations')) {
    addScore(domains, 'cardiovascular', 3, 'Palpitations reported.');
  }
  if (dominantSymptoms.has('poor_focus')) {
    addScore(domains, 'hormonal', 1, 'Poor focus reported.');
  }

  if (getStringValue(rawResponses, 'metabolic_trigger_pattern')) {
    addScore(domains, 'metabolic', 2, 'A metabolic trigger pattern was selected.');
  }

  const mealStructure = getStringValue(rawResponses, 'meal_structure');
  if (mealStructure === 'somewhat_irregular') {
    addScore(domains, 'metabolic', 1, 'Meals are somewhat irregular.');
  }
  if (mealStructure === 'very_irregular') {
    addScore(domains, 'metabolic', 2, 'Meals are very irregular.');
  }

  const waistChange = getStringValue(rawResponses, 'waist_change');
  if (waistChange === 'yes') {
    addScore(domains, 'metabolic', 2, 'Waist size has increased recently.');
  }
  if (waistChange === 'unsure') {
    addScore(domains, 'metabolic', 1, 'Recent waist-size change is uncertain.');
  }

  const familyMetabolicHistory = new Set(getStringArrayValue(rawResponses, 'family_metabolic_history'));
  if (familyMetabolicHistory.has('type_2_diabetes')) {
    addScore(domains, 'metabolic', 2, 'Family history includes type 2 diabetes.');
  }
  if (familyMetabolicHistory.has('high_cholesterol')) {
    addScore(domains, 'metabolic', 1, 'Family history includes high cholesterol.');
  }
  if (familyMetabolicHistory.has('obesity')) {
    addScore(domains, 'metabolic', 1, 'Family history includes obesity.');
  }

  const sleepQuality = getStringValue(rawResponses, 'sleep_quality');
  if (sleepQuality === 'poor') {
    addScore(domains, 'hormonal', 2, 'Sleep quality is poor.');
  }
  if (sleepQuality === 'fair') {
    addScore(domains, 'hormonal', 1, 'Sleep quality is only fair.');
  }

  const afternoonCrash = getStringValue(rawResponses, 'afternoon_crash');
  if (afternoonCrash === 'often') {
    addScore(domains, 'metabolic', 2, 'Afternoon energy crash happens often.');
    addScore(domains, 'hormonal', 1, 'Frequent afternoon crashes may affect recovery.');
  }
  if (afternoonCrash === 'sometimes') {
    addScore(domains, 'metabolic', 1, 'Afternoon energy crash happens sometimes.');
  }

  const stressRecovery = getStringValue(rawResponses, 'stress_recovery');
  if (stressRecovery === 'slowly') {
    addScore(domains, 'hormonal', 2, 'Recovery from stress is slow.');
  }
  if (stressRecovery === 'moderately') {
    addScore(domains, 'hormonal', 1, 'Recovery from stress is moderate.');
  }

  if (getStringValue(rawResponses, 'hormonal_pattern')) {
    addScore(domains, 'hormonal', 2, 'A hormonal pattern was selected.');
  }

  const bloodPressure = getStringValue(rawResponses, 'known_blood_pressure');
  if (bloodPressure === 'borderline') {
    addScore(domains, 'cardiovascular', 2, 'Blood pressure is reportedly borderline elevated.');
  }
  if (bloodPressure === 'high') {
    addScore(domains, 'cardiovascular', 3, 'Blood pressure is reportedly usually high.');
  }

  const weeklyCardio = getStringValue(rawResponses, 'weekly_cardio');
  if (weeklyCardio === '0') {
    addScore(domains, 'cardiovascular', 2, 'No weekly cardio sessions reported.');
    addScore(domains, 'metabolic', 1, 'No weekly cardio sessions reported.');
  }
  if (weeklyCardio === '1_2') {
    addScore(domains, 'cardiovascular', 1, 'Only 1 to 2 weekly cardio sessions reported.');
  }

  const smokingStatus = getStringValue(rawResponses, 'smoking_status');
  if (smokingStatus === 'former') {
    addScore(domains, 'cardiovascular', 1, 'Former smoking history reported.');
  }
  if (smokingStatus === 'current') {
    addScore(domains, 'cardiovascular', 3, 'Current smoking reported.');
  }

  if (getStringValue(rawResponses, 'cardio_pattern')) {
    addScore(domains, 'cardiovascular', 2, 'A cardiovascular concern pattern was selected.');
  }
}

function applyBloodEnhancedIntakeHeuristics(
  rawResponses: Record<string, unknown>,
  domains: Map<string, DomainAccumulator>,
): void {
  const knownMarkerConcerns = new Set(getStringArrayValue(rawResponses, 'known_marker_concerns'));
  if (knownMarkerConcerns.has('hba1c')) {
    addScore(domains, 'metabolic', 2, 'Prior HbA1c or glucose concerns were reported.');
  }
  if (knownMarkerConcerns.has('ldl')) {
    addScore(domains, 'cardiovascular', 2, 'Prior LDL or cholesterol concerns were reported.');
  }
  if (knownMarkerConcerns.has('tsh')) {
    addScore(domains, 'hormonal', 2, 'Prior thyroid marker concerns were reported.');
  }
  if (knownMarkerConcerns.has('crp')) {
    addScore(domains, 'cardiovascular', 1, 'Prior inflammation marker concerns were reported.');
  }

  const fatiguePattern = getStringValue(rawResponses, 'fatigue_pattern');
  if (fatiguePattern === 'afternoon') {
    addScore(domains, 'metabolic', 2, 'Fatigue is most noticeable in the afternoon.');
  }
  if (fatiguePattern === 'all_day') {
    addScore(domains, 'hormonal', 2, 'Fatigue is present throughout the day.');
    addScore(domains, 'metabolic', 1, 'Persistent all-day fatigue may have metabolic overlap.');
  }
  if (fatiguePattern === 'morning') {
    addScore(domains, 'hormonal', 1, 'Fatigue is most noticeable in the morning.');
  }

  const hba1cValue = getNumericValue(rawResponses, 'hba1c_value');
  if (hba1cValue !== null) {
    if (hba1cValue >= 6.5) {
      addScore(domains, 'metabolic', 6, 'Reported HbA1c is in a clearly elevated range.');
    } else if (hba1cValue >= 5.7) {
      addScore(domains, 'metabolic', 3, 'Reported HbA1c is above the optimal range.');
    }
  }

  const familyHistory = new Set(getStringArrayValue(rawResponses, 'family_history'));
  if (familyHistory.has('diabetes')) {
    addScore(domains, 'metabolic', 2, 'Family history includes diabetes.');
  }
  if (familyHistory.has('cardiovascular_disease')) {
    addScore(domains, 'cardiovascular', 2, 'Family history includes cardiovascular disease.');
  }
  if (familyHistory.has('thyroid_disease')) {
    addScore(domains, 'hormonal', 2, 'Family history includes thyroid disease.');
  }

  const carePriority = getStringValue(rawResponses, 'care_priority');
  if (carePriority === 'weight_and_metabolic') {
    addScore(domains, 'metabolic', 2, 'The user prioritised weight and metabolic health.');
  }
  if (carePriority === 'improve_energy') {
    addScore(domains, 'hormonal', 2, 'The user prioritised improving day-to-day energy.');
  }
  if (carePriority === 'reduce_risk') {
    addScore(domains, 'cardiovascular', 2, 'The user prioritised reducing long-term risk.');
    addScore(domains, 'metabolic', 1, 'The user prioritised reducing long-term risk.');
  }

  const followupPreference = getStringValue(rawResponses, 'followup_preference');
  if (followupPreference === 'provider_visit') {
    addScore(domains, 'cardiovascular', 1, 'The user prefers provider-led follow-up.');
  }
  if (followupPreference === 'retest_first') {
    addScore(domains, 'metabolic', 1, 'The user prefers to repeat labs before other follow-up.');
  }
}

function buildRiskBucket(
  riskBuckets: IntakeFlowScoringConfig['riskBuckets'],
  overallScore: number,
): IntakeScoringRiskBucket | undefined {
  const bucket = riskBuckets.find(
    (item) => overallScore >= item.minScore && overallScore <= item.maxScore,
  );

  if (!bucket) {
    return undefined;
  }

  return {
    id: bucket.id,
    label: bucket.label,
    color: bucket.color,
    description: bucket.description,
    minScore: bucket.minScore,
    maxScore: bucket.maxScore,
  };
}

function normalizeBiomarkerCode(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function hasBloodMarkerMatch(
  bloodTestResults: BloodTestResult[],
  candidates: string[],
  predicate: (value: number) => boolean,
): boolean {
  const normalizedCandidates = new Set(candidates.map(normalizeBiomarkerCode));

  return bloodTestResults.some((result) => {
    const code = normalizeBiomarkerCode(result.biomarkerCode);
    return normalizedCandidates.has(code) && predicate(result.value);
  });
}

function deriveTags(
  rawResponses: Record<string, unknown>,
  domainResults: IntakeScoringDomainResult[],
  riskBucket: IntakeScoringRiskBucket | undefined,
  bloodTestResults: BloodTestResult[],
): string[] {
  const tags = new Set<string>();
  const domainById = new Map(domainResults.map((domain) => [domain.domainId, domain]));
  const knownMarkerConcerns = new Set(getStringArrayValue(rawResponses, 'known_marker_concerns'));
  const hba1cValue = getNumericValue(rawResponses, 'hba1c_value');

  const metabolicScore = domainById.get('metabolic')?.weightedScore ?? 0;
  const hormonalScore = domainById.get('hormonal')?.weightedScore ?? 0;
  const cardioScore = domainById.get('cardiovascular')?.weightedScore ?? 0;

  if (
    metabolicScore >= 6 ||
    knownMarkerConcerns.has('hba1c') ||
    (hba1cValue !== null && hba1cValue >= 5.7) ||
    hasBloodMarkerMatch(bloodTestResults, ['HBA1C', 'HBA1c'], (value) => value >= 5.7)
  ) {
    tags.add('high-risk-metabolic');
  }

  if (
    hormonalScore >= 5 ||
    knownMarkerConcerns.has('tsh') ||
    hasBloodMarkerMatch(bloodTestResults, ['TSH'], (value) => value > 4.2)
  ) {
    tags.add('hormonal-strain');
  }

  if (
    cardioScore >= 5 ||
    knownMarkerConcerns.has('ldl') ||
    hasBloodMarkerMatch(bloodTestResults, ['LDL', 'LDLC'], (value) => value > 160)
  ) {
    tags.add('cardio-risk');
  }

  if (riskBucket?.id === 'high') {
    tags.add('needs-clinical-review');
  }

  if (getStringValue(rawResponses, 'last_lab_timing') === 'over_6_months') {
    tags.add('stale-labs');
  }

  return Array.from(tags);
}

function evaluateDomainScoreCondition(
  value: string,
  domains: IntakeScoringDomainResult[],
): boolean {
  const normalized = value.trim();
  const match = normalized.match(/^([a-z0-9_-]+)\s*(>=|<=|>|<|=|:)\s*(-?\d+(?:\.\d+)?)$/i);
  if (!match) {
    return false;
  }

  const [, domainId, operator, thresholdText] = match;
  const threshold = Number(thresholdText);
  const domain = domains.find((item) => item.domainId === domainId);
  if (!domain || Number.isNaN(threshold)) {
    return false;
  }

  const resolvedOperator = operator === ':' ? '>=' : operator;
  return compareValues(domain.weightedScore, resolvedOperator, threshold);
}

function evaluateRules(
  config: IntakeFlowScoringConfig,
  riskBucket: IntakeScoringRiskBucket | undefined,
  domains: IntakeScoringDomainResult[],
  initialTags: string[],
): {
  tags: string[];
  includedPathways: string[];
  excludedPathways: string[];
} {
  const tags = new Set(initialTags);
  const includedPathways = new Set<string>();
  const excludedPathways = new Set<string>();

  const evaluateCondition = (type: string, value: string): boolean => {
    if (type === 'TAG_EXISTS') {
      return tags.has(value);
    }

    if (type === 'RISK_LEVEL') {
      return riskBucket?.id === value;
    }

    if (type === 'DOMAIN_SCORE') {
      return evaluateDomainScoreCondition(value, domains);
    }

    return false;
  };

  for (const rule of config.rules ?? []) {
    const conditionResults = rule.conditions.map((condition) =>
      evaluateCondition(condition.type, condition.value),
    );
    const isMatch =
      rule.conditionOperator === 'OR'
        ? conditionResults.some(Boolean)
        : conditionResults.every(Boolean);

    if (!isMatch) {
      continue;
    }

    for (const action of rule.actions) {
      if (action.type === 'ADD_TAG') {
        tags.add(action.value);
      } else if (action.type === 'INCLUDE_PATHWAY') {
        includedPathways.add(action.value);
      } else if (action.type === 'EXCLUDE_PATHWAY') {
        excludedPathways.add(action.value);
      }
    }
  }

  return {
    tags: Array.from(tags),
    includedPathways: Array.from(includedPathways),
    excludedPathways: Array.from(excludedPathways),
  };
}

export function buildIntakeScoringContext(
  assignedTo: string,
  scoringConfig: IntakeFlowScoringConfig | null,
  intakeData: HealthIntakeData,
  bloodTestResults: BloodTestResult[] = [],
): IntakeScoringContext | undefined {
  if (!scoringConfig?.domains?.length || !isRecord(intakeData.rawResponses)) {
    return undefined;
  }

  const enabledDomains = scoringConfig.domains.filter((domain) => domain.enabled);
  if (enabledDomains.length === 0) {
    return undefined;
  }

  const domains = new Map<string, DomainAccumulator>(
    enabledDomains.map((domain) => [
      domain.id,
      {
        id: domain.id,
        name: domain.name,
        weight: domain.weight,
        rawScore: 0,
        evidence: new Set<string>(),
      },
    ]),
  );

  if (assignedTo === COMPREHENSIVE_MEDICAL_INTAKE) {
    applyComprehensiveMedicalIntakeHeuristics(intakeData.rawResponses, domains);
  }
  if (assignedTo === BLOOD_ENHANCED_INTAKE) {
    applyBloodEnhancedIntakeHeuristics(intakeData.rawResponses, domains);
  }

  applyBloodMarkerRules(scoringConfig, bloodTestResults, domains);

  const domainResults: IntakeScoringDomainResult[] = Array.from(domains.values())
    .map((domain) => ({
      domainId: domain.id,
      domainName: domain.name,
      rawScore: domain.rawScore,
      weightedScore: domain.rawScore * domain.weight,
      weight: domain.weight,
      evidence: Array.from(domain.evidence).slice(0, 4),
    }))
    .sort((left, right) => {
      if (right.weightedScore !== left.weightedScore) {
        return right.weightedScore - left.weightedScore;
      }
      return left.domainName.localeCompare(right.domainName);
    });

  const overallScore = domainResults.reduce((total, domain) => total + domain.weightedScore, 0);
  const riskBucket = buildRiskBucket(scoringConfig.riskBuckets, overallScore);
  const initialTags = deriveTags(
    intakeData.rawResponses,
    domainResults,
    riskBucket,
    bloodTestResults,
  );
  const ruleOutcomes = evaluateRules(scoringConfig, riskBucket, domainResults, initialTags);
  const mappedHeadline = scoringConfig.outputMapping?.riskHeadlineMappings.find(
    (mapping) => mapping.riskBucketId === riskBucket?.id,
  );
  const mappedTagInsights = (scoringConfig.outputMapping?.tagSignalMappings ?? [])
    .filter((mapping) => ruleOutcomes.tags.includes(mapping.tag))
    .map((mapping) => mapping.insightParagraph)
    .filter(Boolean);
  const recommendationPriority = (scoringConfig.outputMapping?.recommendationPriority ?? [])
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((item) => item.label);
  const summarySignals = domainResults
    .filter((domain) => domain.weightedScore > 0)
    .slice(0, 3)
    .map((domain) => {
      const evidence = domain.evidence.slice(0, 2).join(' ');
      return `${domain.domainName} score ${domain.weightedScore}: ${evidence}`.trim();
    });

  if (mappedHeadline?.headline) {
    summarySignals.unshift(`Mapped headline: ${mappedHeadline.headline}.`);
  }
  if (mappedTagInsights.length > 0) {
    summarySignals.push(...mappedTagInsights.slice(0, 2));
  }
  if (ruleOutcomes.includedPathways.length > 0) {
    summarySignals.push(`Suggested pathways: ${ruleOutcomes.includedPathways.join(', ')}.`);
  }

  return {
    assignment: assignedTo,
    overallScore,
    domains: domainResults,
    summarySignals: summarySignals.slice(0, 6),
    riskBucket,
    tags: ruleOutcomes.tags,
    includedPathways: ruleOutcomes.includedPathways,
    excludedPathways: ruleOutcomes.excludedPathways,
    recommendationPriority,
    ...(mappedHeadline
      ? {
          mappedHeadline: {
            riskBucketId: mappedHeadline.riskBucketId,
            headline: mappedHeadline.headline,
            summary: mappedHeadline.summary,
          },
        }
      : {}),
    ...(mappedTagInsights.length > 0 ? { mappedTagInsights } : {}),
  };
}
