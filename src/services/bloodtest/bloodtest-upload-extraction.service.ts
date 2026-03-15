import { AIProviderFactory } from '../ai/ai-provider.factory.js';
import type { BloodTestResult } from '../../types/index.js';
import { ValidationError } from '../../api/middlewares/error.middleware.js';
import logger from '../../utils/logger.js';

export interface UploadedBloodTestImageInput {
  mimeType: string;
  dataBase64: string;
  pageNumber?: number;
}

export interface UploadedBloodTestFileInput {
  fileName: string;
  mimeType: string;
  extractedText?: string;
  images: UploadedBloodTestImageInput[];
}

interface AIExtractionImageInput {
  mimeType: string;
  source: string;
  description: string;
}

interface BiomarkerDefinition {
  code: string;
  name: string;
  category: string;
  aliases: string[];
}

interface CandidateBiomarker {
  biomarkerCode: string;
  biomarkerName: string;
  biomarkerCategory: string;
  value: number;
  unit: string;
  referenceMin?: number;
  referenceMax?: number;
  isAbnormal: boolean;
  source: 'text' | 'ai';
  completenessScore: number;
}

const KNOWN_BIOMARKERS: BiomarkerDefinition[] = [
  { code: 'HBA1C', name: 'HbA1c', category: 'metabolic', aliases: ['hba1c', 'hb a1c', 'hemoglobin a1c', 'glycated haemoglobin'] },
  { code: 'FASTING_GLUCOSE', name: 'Fasting Glucose', category: 'metabolic', aliases: ['fasting glucose', 'glucose'] },
  { code: 'CREATININE', name: 'Creatinine', category: 'renal', aliases: ['creatinine'] },
  { code: 'EGFR', name: 'Estimated GFR', category: 'renal', aliases: ['egfr', 'estimated gfr', 'estimated glomerular filtration rate'] },
  { code: 'UREA', name: 'Urea', category: 'renal', aliases: ['urea', 'bun'] },
  { code: 'SODIUM', name: 'Sodium', category: 'electrolyte', aliases: ['sodium', 'na'] },
  { code: 'POTASSIUM', name: 'Potassium', category: 'electrolyte', aliases: ['potassium', 'k'] },
  { code: 'CHLORIDE', name: 'Chloride', category: 'electrolyte', aliases: ['chloride', 'chloride ion', 'cl'] },
  { code: 'TOTAL_CHOLESTEROL', name: 'Total Cholesterol', category: 'lipid', aliases: ['cholesterol', 'total cholesterol'] },
  { code: 'TRIGLYCERIDES', name: 'Triglycerides', category: 'lipid', aliases: ['triglycerides', 'triglyceride'] },
  { code: 'HDL', name: 'HDL Cholesterol', category: 'lipid', aliases: ['hdl cholesterol', 'hdl cholesterol level', 'hdl'] },
  { code: 'LDL', name: 'LDL Cholesterol', category: 'lipid', aliases: ['ldl cholesterol', 'ldl'] },
  { code: 'NON_HDL_CHOLESTEROL', name: 'Non-HDL Cholesterol', category: 'lipid', aliases: ['non hdl cholesterol', 'non-hdl cholesterol', 'non hdl'] },
  { code: 'CHOL_HDL_RATIO', name: 'Cholesterol/HDL Ratio', category: 'lipid', aliases: ['chol/hdl ratio', 'cholesterol hdl ratio', 'cholesterol / hdl ratio', 'ratio'] },
  { code: 'PSA', name: 'Prostate Specific Antigen', category: 'general', aliases: ['psa', 'prostate specific antigen', 'prostate specific ag'] },
  { code: 'CRP', name: 'C-Reactive Protein', category: 'inflammatory', aliases: ['crp', 'c-reactive protein', 'hs-crp', 'hs crp'] },
  { code: 'IRON', name: 'Iron', category: 'nutrient', aliases: ['iron', 'serum iron'] },
  { code: 'FERRITIN', name: 'Ferritin', category: 'nutrient', aliases: ['ferritin'] },
  { code: 'VIT_D', name: 'Vitamin D', category: 'vitamin', aliases: ['vitamin d', '25-oh vitamin d', '25 oh vitamin d'] },
  { code: 'TSH', name: 'TSH', category: 'thyroid', aliases: ['tsh', 'thyroid stimulating hormone'] },
  { code: 'T4_FREE', name: 'Free T4', category: 'thyroid', aliases: ['free t4', 't4 free'] },
  { code: 'T3_FREE', name: 'Free T3', category: 'thyroid', aliases: ['free t3', 't3 free'] },
];

const NAME_TO_BIOMARKER = new Map<string, BiomarkerDefinition>();
for (const biomarker of KNOWN_BIOMARKERS) {
  for (const alias of biomarker.aliases) {
    NAME_TO_BIOMARKER.set(alias, biomarker);
  }
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifyCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 64) || 'UNKNOWN_BIOMARKER';
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  return null;
}

function inferDefinition(name: string, codeHint?: string | null): BiomarkerDefinition {
  const normalizedName = normalizeName(name);
  const directMatch = NAME_TO_BIOMARKER.get(normalizedName);
  if (directMatch) {
    return directMatch;
  }

  for (const biomarker of KNOWN_BIOMARKERS) {
    if (biomarker.aliases.some((alias) => normalizedName.includes(alias) || alias.includes(normalizedName))) {
      return biomarker;
    }
  }

  if (codeHint) {
    const normalizedCode = slugifyCode(codeHint);
    const byCode = KNOWN_BIOMARKERS.find((biomarker) => biomarker.code === normalizedCode);
    if (byCode) {
      return byCode;
    }
  }

  const inferredCategory = normalizedName.includes('cholesterol') || normalizedName.includes('triglycer')
    ? 'lipid'
    : normalizedName.includes('creatin') || normalizedName.includes('gfr') || normalizedName.includes('urea')
      ? 'renal'
      : normalizedName.includes('vitamin')
        ? 'vitamin'
        : normalizedName.includes('iron') || normalizedName.includes('ferritin')
          ? 'nutrient'
          : normalizedName.includes('thyroid') || normalizedName.includes('tsh') || normalizedName.includes('t4') || normalizedName.includes('t3')
            ? 'thyroid'
            : 'general';

  return {
    code: slugifyCode(codeHint ?? name),
    name: name.trim(),
    category: inferredCategory,
    aliases: [],
  };
}

function calculateCompleteness(candidate: Omit<CandidateBiomarker, 'completenessScore'>): number {
  let score = 0;
  if (candidate.biomarkerCode) score += 2;
  if (candidate.biomarkerName) score += 2;
  if (candidate.unit) score += 2;
  if (typeof candidate.referenceMin === 'number') score += 1;
  if (typeof candidate.referenceMax === 'number') score += 1;
  if (candidate.source === 'text') score += 2;
  if (candidate.isAbnormal) score += 1;
  return score;
}

function buildCandidate(
  name: string,
  value: number,
  unit: string,
  source: CandidateBiomarker['source'],
  options?: {
    codeHint?: string | null;
    referenceMin?: number;
    referenceMax?: number;
    isAbnormal?: boolean;
  },
): CandidateBiomarker {
  const definition = inferDefinition(name, options?.codeHint ?? null);
  const nextCandidate: Omit<CandidateBiomarker, 'completenessScore'> = {
    biomarkerCode: definition.code,
    biomarkerName: definition.name,
    biomarkerCategory: definition.category,
    value,
    unit,
    ...(typeof options?.referenceMin === 'number' ? { referenceMin: options.referenceMin } : {}),
    ...(typeof options?.referenceMax === 'number' ? { referenceMax: options.referenceMax } : {}),
    isAbnormal: typeof options?.isAbnormal === 'boolean'
      ? options.isAbnormal
      : (
        (typeof options?.referenceMin === 'number' && value < options.referenceMin)
        || (typeof options?.referenceMax === 'number' && value > options.referenceMax)
      ),
    source,
  };

  return {
    ...nextCandidate,
    completenessScore: calculateCompleteness(nextCandidate),
  };
}

function parseTextCandidates(text: string): CandidateBiomarker[] {
  const candidates: CandidateBiomarker[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  const rangePattern = /^(?<name>.+?)\s+(?:(?<flag>[HL])\s+)?(?<value>-?\d+(?:\.\d+)?)\s+(?<unit>[A-Za-z%µμ][A-Za-z0-9%µμ/.\-]*)\s+(?<refMin>-?\d+(?:\.\d+)?)\s*-\s*(?<refMax>-?\d+(?:\.\d+)?)$/i;
  const comparatorPattern = /^(?<name>.+?)\s+(?:(?<flag>[HL])\s+)?(?<value>-?\d+(?:\.\d+)?)\s+(?<unit>[A-Za-z%µμ][A-Za-z0-9%µμ/.\-]*)\s+(?<comparator>[<>])\s*(?<bound>-?\d+(?:\.\d+)?)$/i;

  for (const line of lines) {
    const rangeMatch = line.match(rangePattern);
    if (rangeMatch?.groups) {
      const matchedName = rangeMatch.groups['name'];
      const matchedUnit = rangeMatch.groups['unit'];
      const value = parseNumericValue(rangeMatch.groups['value']);
      const refMin = parseNumericValue(rangeMatch.groups['refMin']);
      const refMax = parseNumericValue(rangeMatch.groups['refMax']);
      if (typeof matchedName === 'string' && typeof matchedUnit === 'string' && value !== null) {
        candidates.push(buildCandidate(
          matchedName,
          value,
          matchedUnit,
          'text',
          {
            ...(typeof refMin === 'number' ? { referenceMin: refMin } : {}),
            ...(typeof refMax === 'number' ? { referenceMax: refMax } : {}),
            ...(rangeMatch.groups['flag'] ? { isAbnormal: true } : {}),
          },
        ));
      }
      continue;
    }

    const comparatorMatch = line.match(comparatorPattern);
    if (comparatorMatch?.groups) {
      const matchedName = comparatorMatch.groups['name'];
      const matchedUnit = comparatorMatch.groups['unit'];
      const value = parseNumericValue(comparatorMatch.groups['value']);
      const bound = parseNumericValue(comparatorMatch.groups['bound']);
      if (typeof matchedName === 'string' && typeof matchedUnit === 'string' && value !== null && bound !== null) {
        const comparator = comparatorMatch.groups['comparator'];
        candidates.push(buildCandidate(
          matchedName,
          value,
          matchedUnit,
          'text',
          {
            ...(comparator === '>' ? { referenceMin: bound } : { referenceMax: bound }),
            ...(comparatorMatch.groups['flag'] ? { isAbnormal: true } : {}),
          },
        ));
      }
    }
  }

  return candidates;
}

function extractPatientIdentifiers(text: string): string[] {
  const identifiers = new Set<string>();
  const patterns = [
    /patient\s*(?:no|number|id)?\s*[:#]?\s*([A-Za-z0-9-]{1,32})/gi,
    /specimen\s*(?:no|number|id)?\s*[:#]?\s*([A-Za-z0-9-]{4,32})/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const identifier = match[1]?.trim();
      if (!identifier) {
        continue;
      }

      const normalized = identifier.toLowerCase();
      if (normalized === 'details' || normalized === 'name') {
        continue;
      }

      identifiers.add(normalized);
    }
  }

  return Array.from(identifiers);
}

function validatePatientConsistency(files: UploadedBloodTestFileInput[]): void {
  const identifiers = new Set<string>();

  files.forEach((file) => {
    extractPatientIdentifiers(file.extractedText ?? '').forEach((identifier) => {
      identifiers.add(identifier);
    });
  });

  if (identifiers.size > 1) {
    throw new ValidationError(
      'The uploaded document appears to contain results from more than one patient. Please upload a single-patient blood test report.'
    );
  }
}

function extractBiomarkerArray(value: unknown): unknown[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const record = value as Record<string, unknown>;
  if (Array.isArray(record['biomarkers'])) {
    return record['biomarkers'];
  }
  if (Array.isArray(record['results'])) {
    return record['results'];
  }

  return [];
}

function parseAICandidates(extractedData: unknown): CandidateBiomarker[] {
  const biomarkerItems = extractBiomarkerArray(extractedData);
  return biomarkerItems.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const record = item as Record<string, unknown>;
    const name = typeof record['name'] === 'string'
      ? record['name']
      : typeof record['biomarkerName'] === 'string'
        ? record['biomarkerName']
        : typeof record['label'] === 'string'
          ? record['label']
          : null;
    const value = parseNumericValue(record['value']);
    const unit = typeof record['unit'] === 'string' ? record['unit'].trim() : '';
    const referenceMin = parseNumericValue(record['referenceMin'] ?? record['refMin'] ?? record['min']);
    const referenceMax = parseNumericValue(record['referenceMax'] ?? record['refMax'] ?? record['max']);

    if (!name || value === null || !unit) {
      return [];
    }

    const statusText = typeof record['status'] === 'string' ? record['status'].toLowerCase() : '';
    const flagText = typeof record['flag'] === 'string' ? record['flag'].toLowerCase() : '';
    const isAbnormal = ['abnormal', 'high', 'low', 'critical'].some((keyword) => statusText.includes(keyword))
      || ['h', 'l', 'high', 'low'].includes(flagText);

    return [
      buildCandidate(name, value, unit, 'ai', {
        codeHint: typeof record['code'] === 'string' ? record['code'] : null,
        ...(typeof referenceMin === 'number' ? { referenceMin } : {}),
        ...(typeof referenceMax === 'number' ? { referenceMax } : {}),
        isAbnormal,
      }),
    ];
  });
}

function mergeCandidates(candidates: CandidateBiomarker[]): BloodTestResult[] {
  const merged = new Map<string, CandidateBiomarker>();

  for (const candidate of candidates) {
    const existing = merged.get(candidate.biomarkerCode);
    if (!existing) {
      merged.set(candidate.biomarkerCode, candidate);
      continue;
    }

    const next = candidate.completenessScore > existing.completenessScore
      ? {
        ...candidate,
        referenceMin: candidate.referenceMin ?? existing.referenceMin,
        referenceMax: candidate.referenceMax ?? existing.referenceMax,
      }
      : {
        ...existing,
        referenceMin: existing.referenceMin ?? candidate.referenceMin,
        referenceMax: existing.referenceMax ?? candidate.referenceMax,
      };

    merged.set(candidate.biomarkerCode, {
      biomarkerCode: next.biomarkerCode,
      biomarkerName: next.biomarkerName,
      biomarkerCategory: next.biomarkerCategory,
      value: next.value,
      unit: next.unit,
      ...(typeof next.referenceMin === 'number' ? { referenceMin: next.referenceMin } : {}),
      ...(typeof next.referenceMax === 'number' ? { referenceMax: next.referenceMax } : {}),
      isAbnormal: next.isAbnormal || existing.isAbnormal || candidate.isAbnormal,
      source: next.source,
      completenessScore: next.completenessScore,
    });
  }

  return Array.from(merged.values())
    .sort((left, right) => left.biomarkerName.localeCompare(right.biomarkerName))
    .map((candidate) => ({
      biomarkerCode: candidate.biomarkerCode,
      biomarkerName: candidate.biomarkerName,
      biomarkerCategory: candidate.biomarkerCategory,
      value: candidate.value,
      unit: candidate.unit,
      ...(typeof candidate.referenceMin === 'number' ? { referenceMin: candidate.referenceMin } : {}),
      ...(typeof candidate.referenceMax === 'number' ? { referenceMax: candidate.referenceMax } : {}),
      isAbnormal: candidate.isAbnormal,
    }));
}

export class BloodTestUploadExtractionService {
  async extract(files: UploadedBloodTestFileInput[]): Promise<BloodTestResult[]> {
    validatePatientConsistency(files);
    const textCandidates = files.flatMap((file) => parseTextCandidates(file.extractedText ?? ''));
    const aiCandidates = await this.extractWithAI(files);
    const mergedResults = mergeCandidates([...textCandidates, ...aiCandidates]);

    if (mergedResults.length === 0) {
      throw new ValidationError(
        'We could not confidently read biomarkers from the uploaded report. Please try a clearer PDF/image or use a supported lab report.'
      );
    }

    return mergedResults;
  }

  private async extractWithAI(files: UploadedBloodTestFileInput[]): Promise<CandidateBiomarker[]> {
    const allImages = files.flatMap((file) =>
      file.images.map((image) => ({
        mimeType: image.mimeType,
        source: image.dataBase64,
        description: image.pageNumber
          ? `${file.fileName} page ${image.pageNumber}`
          : file.fileName,
      }))
    );

    if (allImages.length === 0) {
      return [];
    }

    const provider = AIProviderFactory.getProvider();
    if (!provider.analyzeImage || (provider.supportsImageAnalysis && !provider.supportsImageAnalysis())) {
      logger.warn('Configured AI provider does not support blood test image extraction', {
        provider: provider.getProviderName(),
      });
      return [];
    }

    try {
      const primaryCandidates = await this.extractCandidatesFromImages(provider, allImages.slice(0, 8));
      if (primaryCandidates.length > 0 || allImages.length <= 1) {
        return primaryCandidates;
      }

      logger.info('Retrying blood test extraction page by page after empty multi-page result', {
        pages: Math.min(allImages.length, 8),
      });

      const fallbackCandidates: CandidateBiomarker[] = [];
      for (const image of allImages.slice(0, 8)) {
        const pageCandidates = await this.extractCandidatesFromImages(provider, [image]);
        fallbackCandidates.push(...pageCandidates);
      }

      return fallbackCandidates;
    } catch (error) {
      logger.error('Failed to extract uploaded blood test with AI', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  private async extractCandidatesFromImages(
    provider: NonNullable<ReturnType<typeof AIProviderFactory.getProvider>>,
    images: AIExtractionImageInput[],
  ): Promise<CandidateBiomarker[]> {
    if (images.length === 0) {
      return [];
    }

    const analysis = await provider.analyzeImage!({
      analysisType: 'blood_test',
      images,
    });

    return parseAICandidates(analysis.extractedData);
  }
}

export const bloodTestUploadExtractionService = new BloodTestUploadExtractionService();
