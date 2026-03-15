// ============================================
// HealthPilot Type Definitions
// ============================================

import { Request } from 'express';

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: ErrorDetail[];
}

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ApiMeta {
  timestamp: string;
  requestId?: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ============================================
// Authentication Types
// ============================================

export interface JwtPayload {
  userId: string;
  email?: string;
  role: string;
  isAnonymous: boolean;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  requestId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ============================================
// User Types
// ============================================

export interface CreateUserDto {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  gender?: Gender;
  phoneNumber?: string;
}

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  gender?: Gender;
  phoneNumber?: string;
}

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'DELETED';

export type UserRole = 'USER' | 'PROVIDER_ADMIN' | 'ADMIN' | 'SUPER_ADMIN';

// ============================================
// Health Intake Types
// ============================================

export interface HealthIntakeData {
  medicalHistory: MedicalHistory;
  familyHistory: FamilyHistory;
  symptoms: Symptom[];
  biometrics?: {
    height: number;
    weight: number;
    bmi?: number;
  };
  goals: HealthGoal[];
  lifestyle: LifestyleData;
  preferences: TreatmentPreferences;
  rawResponses?: Record<string, unknown>;
}

export interface MedicalHistory {
  conditions: string[];
  surgeries: Surgery[];
  allergies: string[];
  currentMedications: Medication[];
  hasChronicConditions?: boolean;
}

export interface Surgery {
  name: string;
  year: number;
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
}

export interface FamilyHistory {
  conditions: FamilyCondition[];
}

export interface FamilyCondition {
  condition: string;
  relation: string;
}

export interface Symptom {
  name: string;
  category?: string; // e.g., "fatigue", "weight", "mood", "pain"
  severity: 'mild' | 'moderate' | 'severe';
  duration: string;
  frequency: string;
}

export interface HealthGoal {
  category: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
}

export interface LifestyleData {
  smokingStatus: 'never' | 'former' | 'current';
  alcoholConsumption: 'none' | 'occasional' | 'moderate' | 'heavy';
  exerciseFrequency: 'none' | 'light' | 'moderate' | 'active' | 'very_active';
  dietType: string;
  sleepHours: number;
  stressLevel: 'low' | 'moderate' | 'high';
}

export interface TreatmentPreferences {
  riskTolerance: 'low' | 'medium' | 'high';
  budgetSensitivity: 'low' | 'medium' | 'high';
  preferSubscription: boolean;
  deliveryPreference: 'home' | 'clinic' | 'pharmacy';
}

// ============================================
// Blood Test Types
// ============================================

export interface BloodTestResult {
  biomarkerCode: string;
  biomarkerName?: string;
  biomarkerCategory?: string;
  value: number;
  unit: string;
  referenceMin?: number;
  referenceMax?: number;
  isAbnormal: boolean;
}

export type BloodTestStatus =
  | 'PENDING'
  | 'ORDERED'
  | 'SAMPLE_COLLECTED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type PanelType = 'targeted' | 'goal-based' | 'comprehensive';

// ============================================
// Recommendation Types
// ============================================

export interface RecommendationOutput {
  healthSummary: HealthSummary;
  treatmentPathways: TreatmentPathway[];
  supplementSuggestions: SupplementSuggestion[];
  lifestyleRecommendations: string[];
}

export interface HealthSummary {
  overview: string;
  keyFindings: string[];
  areasOfConcern: string[];
  positiveIndicators: string[];
}

export interface TreatmentPathway {
  treatmentId: string;
  treatmentName: string;
  category: string;
  relevanceScore: number;
  matchReasons: string[];
  contraindications: string[];
  isEligible: boolean;
  providerName: string;
  providerId: string;
  pricing: TreatmentPricing;
}

export interface TreatmentPricing {
  oneTime?: number;
  subscription?: number;
  subscriptionFrequency?: string;
  currency: string;
}

export interface SupplementSuggestion {
  name: string;
  reason: string;
  dosage: string;
  timing: string;
}

// ============================================
// Provider Types
// ============================================

export type ProviderStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

export type TreatmentCategory =
  | 'HORMONE_THERAPY'
  | 'WEIGHT_MANAGEMENT'
  | 'SEXUAL_HEALTH'
  | 'MENTAL_HEALTH'
  | 'LONGEVITY'
  | 'SKIN_HEALTH'
  | 'HAIR_HEALTH'
  | 'SLEEP_OPTIMIZATION'
  | 'COGNITIVE_ENHANCEMENT'
  | 'GENERAL_WELLNESS';

// ============================================
// Handoff Types
// ============================================

export interface HandoffData {
  userId: string;
  intakeData: HealthIntakeData;
  bloodTestResults?: BloodTestResult[];
  recommendationId: string;
  selectedTreatmentId: string;
  consentTimestamp: Date;
}

export type HandoffStatus =
  | 'INITIATED'
  | 'DATA_TRANSFERRED'
  | 'PROVIDER_RECEIVED'
  | 'CONSULTATION_SCHEDULED'
  | 'TREATMENT_STARTED'
  | 'COMPLETED'
  | 'CANCELLED';

// ============================================
// Matching Rule Types
// ============================================

export type MatchingRuleOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'GREATER_THAN_OR_EQUALS'
  | 'LESS_THAN_OR_EQUALS'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'IN'
  | 'NOT_IN'
  | 'BETWEEN'
  | 'IS_NULL'
  | 'IS_NOT_NULL';

export interface MatchingRuleDefinition {
  field: string;
  operator: MatchingRuleOperator;
  value: unknown;
  weight: number;
  isRequired: boolean;
}

// ============================================
// Audit Types
// ============================================

export type AuditAction =
  | 'CREATE'
  | 'READ'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'EXPORT'
  | 'HANDOFF';

export interface AuditLogEntry {
  userId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// AI Types
// ============================================

export interface AIAnalysisRequest {
  intakeData: HealthIntakeData;
  bloodTestResults?: BloodTestResult[];
  userAge?: number;
  userGender?: Gender;
  intakeScoring?: IntakeScoringContext;
}

export interface IntakeScoringRiskBucket {
  id: string;
  label: string;
  color: string;
  description?: string;
  minScore: number;
  maxScore: number;
}

export interface IntakeScoringDomainResult {
  domainId: string;
  domainName: string;
  rawScore: number;
  weightedScore: number;
  weight: number;
  evidence: string[];
}

export interface IntakeScoringHeadlineMapping {
  riskBucketId: string;
  headline: string;
  summary: string;
}

export interface IntakeScoringContext {
  assignment: string;
  overallScore: number;
  domains: IntakeScoringDomainResult[];
  summarySignals: string[];
  riskBucket?: IntakeScoringRiskBucket;
  tags?: string[];
  includedPathways?: string[];
  excludedPathways?: string[];
  recommendationPriority?: string[];
  mappedHeadline?: IntakeScoringHeadlineMapping;
  mappedTagInsights?: string[];
}

// Next Step Recommendation - structured recommendation with effort level
export interface NextStepRecommendation {
  id: string;
  title: string;
  description: string;
  effortLevel: 'LOW' | 'MODERATE' | 'HIGH';
  icon: 'sleep' | 'food' | 'doctor' | 'exercise' | 'tracking' | 'mental_health' | 'supplements';
  whatHappensNext: string;
  learnMoreUrl?: string;
}

export type SolutionCategoryId =
  | 'LOW_ENERGY'
  | 'DIGESTIVE_DISCOMFORT'
  | 'POOR_SLEEP'
  | 'WEIGHT_MANAGEMENT';

export interface AISolutionCategory {
  id: SolutionCategoryId;
  label: string;
  reason: string;
}

export interface AISolutionPlan {
  strategyTitle: string;
  strategySummary: string;
  whyThisPlan: string[];
  focusCategories: AISolutionCategory[];
}

export interface RecommendedSolutionProvider {
  providerId: string;
  providerName: string;
  providerSlug: string;
  providerDescription?: string;
  providerWebsiteUrl?: string;
  providerLogoUrl?: string;
  supportedRegions: string[];
  matchedCategoryIds: SolutionCategoryId[];
  matchScore: number;
  matchedTreatments: Array<{
    treatmentId: string;
    treatmentName: string;
    treatmentCategory: string;
    matchReasons: string[];
  }>;
}

export interface RecommendedSolutionSupplement {
  supplementId: string;
  name: string;
  slug: string;
  category: string;
  description?: string;
  evidenceLevel?: string;
  averagePrice?: number;
  currency: string;
  primaryBenefits: string[];
  matchedCategoryIds: SolutionCategoryId[];
  matchScore: number;
  matchReason?: string;
  expectedBenefit?: string;
}

export interface RecommendedSolutionCategory {
  id: SolutionCategoryId;
  label: string;
  providerCount: number;
  supplementCount: number;
}

export interface RecommendedSolutionsPayload {
  solutionPlan: AISolutionPlan;
  providerMatches: RecommendedSolutionProvider[];
  supplementMatches: RecommendedSolutionSupplement[];
  symptomCategories: RecommendedSolutionCategory[];
}

export interface StructuredSummarySignalGroup {
  title: string;
  items: string[];
}

export interface StructuredSummaryBiomarker {
  biomarkerCode: string;
  displayName: string;
  value: number;
  unit: string;
  referenceRange: string;
  status: 'IN_RANGE' | 'SLIGHTLY_HIGH' | 'SLIGHTLY_LOW';
  detail: string;
}

export interface BloodEnhancedStructuredSummary {
  plainLanguageSummary: string[];
  responseSignals: StructuredSummarySignalGroup[];
  bloodTestSignals: StructuredSummaryBiomarker[];
  whatThisMayMean: string[];
  limitationsAndBoundaries: string[];
  nextActionLabel?: string;
}

export interface AIAnalysisResponse {
  healthSummary: string;
  recommendations: string[];
  warnings: string[];
  nextSteps?: NextStepRecommendation[];
  solutionPlan?: AISolutionPlan;
  structuredSummary?: BloodEnhancedStructuredSummary;
  tokensUsed: number;
  modelVersion: string;
  promptVersion: string;
}

// ============================================
// Explanation Types ("Why This?" Feature)
// ============================================

export interface TreatmentExplanation {
  treatmentId: string;
  treatmentName: string;
  category: string;
  whyRecommended: ExplanationReason[];
  howItWorks: string;
  evidenceSupport: string[];
  personalizedFactors: PersonalizedFactor[];
  biomarkerInsights?: BiomarkerInsight[];
  limitations: string[];
  disclaimers: string[];
  relatedAlternatives?: RelatedTreatment[];
}

export interface ExplanationReason {
  type: 'goal_match' | 'symptom_match' | 'biomarker_match' | 'lifestyle_match' | 'eligibility';
  title: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface PersonalizedFactor {
  factor: string;
  impact: 'positive' | 'neutral' | 'consideration';
  description: string;
}

export interface BiomarkerInsight {
  biomarkerCode: string;
  biomarkerName: string;
  relevance: string;
  currentStatus: 'normal' | 'low' | 'high' | 'abnormal';
  howTreatmentHelps?: string;
}

export interface RelatedTreatment {
  treatmentId: string;
  treatmentName: string;
  differentiator: string;
}
