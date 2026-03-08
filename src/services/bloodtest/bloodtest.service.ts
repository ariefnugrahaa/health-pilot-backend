import { prisma } from '../../utils/database.js';
import { encryptionService } from '../../utils/encryption.js';
import logger from '../../utils/logger.js';
import { NotFoundError, ValidationError } from '../../api/middlewares/error.middleware.js';
import { bloodTestInterpretationService } from './bloodtest-interpretation.service.js';
import type { BloodTestResult } from '../../types/index.js';

type LabServiceType = 'HOME_VISIT' | 'ON_SITE';
type BiomarkerStatus = 'IN_RANGE' | 'SLIGHTLY_HIGH' | 'SLIGHTLY_LOW';

interface LabOperatingTimeSlot {
  start: string;
  end: string;
}

interface LabOperatingDay {
  day: string;
  capacity: number;
  timeSlots: LabOperatingTimeSlot[];
}

export interface PublicBloodTestTimeSlot {
  id: string;
  label: string;
  start: string;
  end: string;
}

export interface PublicBloodTestDateOption {
  date: string;
  label: string;
  timeSlots: PublicBloodTestTimeSlot[];
}

export interface PublicBloodTestLabOption {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string | null;
  addressLine: string;
  serviceTypes: LabServiceType[];
  serviceLabel: string;
  resultTimeLabel: string;
  rating: number;
  reviewCount: number;
  availableDates: PublicBloodTestDateOption[];
}

export interface BloodTestOrderOptions {
  enabled: boolean;
  labs: PublicBloodTestLabOption[];
}

export interface CreateBloodTestBookingInput {
  labId: string;
  bookingDate: string;
  timeSlotId: string;
  panelType?: string;
}

export interface CreateBloodTestBookingResult {
  bookingId: string;
  testId: string;
  bookingStatus: string;
}

export interface UploadBloodTestResultInput {
  fileNames: string[];
  panelType?: string;
}

export interface UploadBloodTestResultResponse {
  testId: string;
  status: string;
  uploadedFiles: string[];
}

export interface BloodTestReportBiomarker {
  id: string;
  code: string;
  name: string;
  displayName: string;
  value: number;
  unit: string;
  referenceRange: string;
  status: BiomarkerStatus;
  detail: string;
}

export interface BloodTestReport {
  testId: string;
  intakeAssignment: string;
  overallHeadline: string;
  overallSummary: string;
  counts: {
    inRange: number;
    slightlyHigh: number;
    slightlyLow: number;
  };
  biomarkers: BloodTestReportBiomarker[];
  featuredBiomarkerCodes: string[];
  booking: {
    id: string | null;
    labName: string;
    labAddress: string | null;
    bookingDate: string | null;
    timeSlot: string | null;
  };
}

interface DemoBiomarkerDefinition extends BloodTestResult {
  name: string;
  displayName: string;
  detail: string;
}

interface SystemSettings {
  bloodTestAllowOrder?: boolean;
}

const DAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  timeZone: 'UTC',
});

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const TIME_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'UTC',
});

const DEFAULT_REVIEW_METADATA: Record<string, { rating: number; reviewCount: number }> = {
  'Quest Diagnostics - Manhattan': { rating: 4.8, reviewCount: 290 },
  'LabCorp - Brooklyn Heights': { rating: 4.8, reviewCount: 214 },
  'Quest Diagnostics - Los Angeles': { rating: 4.7, reviewCount: 188 },
};

const FEATURED_BLOOD_TEST_CODES = ['LDL', 'FASTING_GLUCOSE', 'CRP', 'IRON'];

const DEMO_BLOOD_TEST_RESULTS: DemoBiomarkerDefinition[] = [
  {
    biomarkerCode: 'LDL',
    name: 'LDL Cholesterol',
    displayName: 'Cholesterol (LDL)',
    value: 98,
    unit: 'mg/dL',
    referenceMin: 0,
    referenceMax: 100,
    isAbnormal: false,
    detail: 'LDL is within the optimal range, which is reassuring for cardiovascular risk.',
  },
  {
    biomarkerCode: 'FASTING_GLUCOSE',
    name: 'Fasting Glucose',
    displayName: 'Blood Sugar (Glucose)',
    value: 105,
    unit: 'mg/dL',
    referenceMin: 65,
    referenceMax: 99,
    isAbnormal: true,
    detail:
      'Fasting glucose is slightly above the preferred range and may benefit from dietary and lifestyle review.',
  },
  {
    biomarkerCode: 'CRP',
    name: 'C-Reactive Protein',
    displayName: 'Inflammation (hs-CRP)',
    value: 0.9,
    unit: 'mg/L',
    referenceMin: 0,
    referenceMax: 2,
    isAbnormal: false,
    detail: 'hs-CRP is in range and does not suggest elevated systemic inflammation right now.',
  },
  {
    biomarkerCode: 'IRON',
    name: 'Iron',
    displayName: 'Iron (Serum Iron)',
    value: 48,
    unit: 'mcg/dL',
    referenceMin: 50,
    referenceMax: 170,
    isAbnormal: true,
    detail:
      'Serum iron is slightly low and could contribute to fatigue, lower stamina, or recovery issues.',
  },
  {
    biomarkerCode: 'HDL',
    name: 'HDL Cholesterol',
    displayName: 'HDL Cholesterol',
    value: 59,
    unit: 'mg/dL',
    referenceMin: 40,
    referenceMax: 80,
    isAbnormal: false,
    detail: 'HDL is in a healthy range and supports a balanced lipid profile.',
  },
  {
    biomarkerCode: 'VIT_D',
    name: 'Vitamin D (25-OH)',
    displayName: 'Vitamin D',
    value: 42,
    unit: 'ng/mL',
    referenceMin: 30,
    referenceMax: 100,
    isAbnormal: false,
    detail:
      'Vitamin D is within range, which is supportive for bone, immune, and metabolic health.',
  },
];

// ============================================
// Service Interface
// ============================================
export interface IBloodTestService {
  listOrderOptions(): Promise<BloodTestOrderOptions>;
  orderTest(userId: string, panelType: string): Promise<string>;
  createDemoBooking(
    userId: string,
    input: CreateBloodTestBookingInput
  ): Promise<CreateBloodTestBookingResult>;
  createUploadedResult(
    userId: string,
    input: UploadBloodTestResultInput
  ): Promise<UploadBloodTestResultResponse>;
  processResults(testId: string, results: BloodTestResult[]): Promise<void>;
  getTest(testId: string, userId: string): Promise<unknown>;
  getReport(testId: string, userId: string): Promise<BloodTestReport>;
}

// ============================================
// Service Implementation
// ============================================
export class BloodTestService implements IBloodTestService {
  async listOrderOptions(): Promise<BloodTestOrderOptions> {
    const systemSetting = await prisma.platformSetting.findUnique({
      where: { key: 'system' },
      select: { value: true },
    });
    const systemSettings = this.normalizeSystemSettings(systemSetting?.value);

    if (systemSettings.bloodTestAllowOrder === false) {
      return { enabled: false, labs: [] };
    }

    const labs = await prisma.lab.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    return {
      enabled: true,
      labs: labs
        .map((lab) => this.mapLabToOrderOption(lab))
        .filter((lab) => lab.availableDates.length > 0),
    };
  }

  /**
   * Order a new blood test without booking metadata.
   */
  async orderTest(userId: string, panelType: string): Promise<string> {
    if (!['targeted', 'goal-based', 'comprehensive'].includes(panelType)) {
      throw new ValidationError('Invalid panel type');
    }

    const labPartner = await prisma.labPartner.findFirst({
      where: { isActive: true },
    });

    if (!labPartner) {
      throw new ValidationError('No active lab partner found');
    }

    const test = await prisma.bloodTest.create({
      data: {
        userId,
        status: 'ORDERED',
        panelType,
        biomarkersRequested: this.getBiomarkersForPanel(panelType),
        labPartnerId: labPartner.id,
        orderedAt: new Date(),
      },
    });

    logger.info('Blood test ordered', { testId: test.id, userId, panelType });
    return test.id;
  }

  async createDemoBooking(
    userId: string,
    input: CreateBloodTestBookingInput
  ): Promise<CreateBloodTestBookingResult> {
    const panelType = input.panelType ?? 'comprehensive';
    if (!['targeted', 'goal-based', 'comprehensive'].includes(panelType)) {
      throw new ValidationError('Invalid panel type');
    }

    const orderOptions = await this.listOrderOptions();
    if (!orderOptions.enabled) {
      throw new ValidationError('Blood test ordering is currently disabled');
    }

    const selectedLab = orderOptions.labs.find((lab) => lab.id === input.labId);
    if (!selectedLab) {
      throw new ValidationError('Selected lab is not available for booking');
    }

    const selectedDate = selectedLab.availableDates.find((date) => date.date === input.bookingDate);
    if (!selectedDate) {
      throw new ValidationError('Selected booking date is not available');
    }

    const selectedTimeSlot = selectedDate.timeSlots.find((slot) => slot.id === input.timeSlotId);
    if (!selectedTimeSlot) {
      throw new ValidationError('Selected time slot is not available');
    }

    const lab = await prisma.lab.findUnique({
      where: { id: input.labId },
    });
    if (!lab || !lab.isActive) {
      throw new ValidationError('Selected lab is not active');
    }

    const labPartner = await prisma.labPartner.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!labPartner) {
      throw new ValidationError('No active lab partner found');
    }

    const bookingDate = this.toBookingDate(input.bookingDate);
    const bookingStatus = lab.requireManualConfirmation ? 'PENDING' : 'SCHEDULED';

    const { bookingId, testId } = await prisma.$transaction(async (tx) => {
      const test = await tx.bloodTest.create({
        data: {
          userId,
          status: 'ORDERED',
          panelType,
          biomarkersRequested: DEMO_BLOOD_TEST_RESULTS.map((result) => result.biomarkerCode),
          labPartnerId: labPartner.id,
          orderedAt: new Date(),
          sampleCollectedAt: bookingDate,
        },
      });

      const booking = await tx.labBooking.create({
        data: {
          labId: lab.id,
          userId,
          bloodTestId: test.id,
          bookingDate,
          timeSlot: selectedTimeSlot.label,
          status: bookingStatus,
        },
      });

      return { bookingId: booking.id, testId: test.id };
    });

    await this.processResults(
      testId,
      DEMO_BLOOD_TEST_RESULTS.map((result) => ({
        biomarkerCode: result.biomarkerCode,
        value: result.value,
        unit: result.unit,
        isAbnormal: result.isAbnormal,
        ...(result.referenceMin !== undefined ? { referenceMin: result.referenceMin } : {}),
        ...(result.referenceMax !== undefined ? { referenceMax: result.referenceMax } : {}),
      }))
    );

    await this.storeDemoInterpretation(testId);

    logger.info('Blood test demo booking created', {
      bookingId,
      testId,
      userId,
      labId: lab.id,
      bookingDate: input.bookingDate,
      timeSlotId: input.timeSlotId,
    });

    return {
      bookingId,
      testId,
      bookingStatus,
    };
  }

  async createUploadedResult(
    userId: string,
    input: UploadBloodTestResultInput
  ): Promise<UploadBloodTestResultResponse> {
    const panelType = input.panelType ?? 'comprehensive';
    if (!['targeted', 'goal-based', 'comprehensive'].includes(panelType)) {
      throw new ValidationError('Invalid panel type');
    }

    if (input.fileNames.length === 0) {
      throw new ValidationError('At least one uploaded file is required');
    }

    const labPartner = await prisma.labPartner.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    const now = new Date();
    const test = await prisma.bloodTest.create({
      data: {
        userId,
        status: 'ORDERED',
        panelType,
        biomarkersRequested: DEMO_BLOOD_TEST_RESULTS.map((result) => result.biomarkerCode),
        labPartnerId: labPartner?.id ?? null,
        orderedAt: now,
        sampleCollectedAt: now,
      },
    });

    await this.processResults(
      test.id,
      DEMO_BLOOD_TEST_RESULTS.map((result) => ({
        biomarkerCode: result.biomarkerCode,
        value: result.value,
        unit: result.unit,
        isAbnormal: result.isAbnormal,
        ...(result.referenceMin !== undefined ? { referenceMin: result.referenceMin } : {}),
        ...(result.referenceMax !== undefined ? { referenceMax: result.referenceMax } : {}),
      }))
    );

    await this.storeDemoInterpretation(test.id);

    logger.info('Blood test upload result created', {
      testId: test.id,
      userId,
      uploadedFiles: input.fileNames,
    });

    return {
      testId: test.id,
      status: 'COMPLETED',
      uploadedFiles: input.fileNames,
    };
  }

  /**
   * Process incoming results (e.g. from webhook)
   */
  async processResults(testId: string, results: BloodTestResult[]): Promise<void> {
    const test = await prisma.bloodTest.findUnique({
      where: { id: testId },
    });

    if (!test) {
      throw new NotFoundError('Blood test');
    }

    const resultsEncrypted = encryptionService.encrypt(JSON.stringify(results));

    await prisma.$transaction(async (tx) => {
      await tx.bloodTest.update({
        where: { id: testId },
        data: {
          status: 'COMPLETED',
          resultsEncrypted,
          resultsReceivedAt: new Date(),
        },
      });

      await tx.biomarkerResult.deleteMany({
        where: { bloodTestId: testId },
      });

      for (const result of results) {
        let biomarker = await tx.biomarker.findUnique({
          where: { code: result.biomarkerCode },
        });

        if (!biomarker) {
          biomarker = await tx.biomarker.create({
            data: {
              code: result.biomarkerCode,
              name: result.biomarkerCode,
              unit: result.unit,
              category: 'general',
            },
          });
        }

        await tx.biomarkerResult.create({
          data: {
            bloodTestId: testId,
            biomarkerId: biomarker.id,
            value: result.value,
            unit: result.unit,
            referenceMin: result.referenceMin ?? null,
            referenceMax: result.referenceMax ?? null,
            isAbnormal: result.isAbnormal,
          },
        });
      }
    });

    logger.info('Blood test results processed', { testId });
  }

  /**
   * Get test details
   */
  async getTest(testId: string, userId: string): Promise<unknown> {
    const test = await prisma.bloodTest.findFirst({
      where: { id: testId, userId },
      include: {
        biomarkerResults: {
          include: { biomarker: true },
        },
        labPartner: true,
      },
    });

    if (!test) {
      throw new NotFoundError('Blood test');
    }

    return test;
  }

  async getReport(testId: string, userId: string): Promise<BloodTestReport> {
    const test = await prisma.bloodTest.findFirst({
      where: { id: testId, userId },
      include: {
        biomarkerResults: {
          include: { biomarker: true },
          orderBy: { createdAt: 'asc' },
        },
        labPartner: true,
      },
    });

    if (!test) {
      throw new NotFoundError('Blood test');
    }

    const booking = await prisma.labBooking.findFirst({
      where: {
        bloodTestId: testId,
        userId,
      },
      include: {
        lab: true,
      },
    });

    const interpretation = await bloodTestInterpretationService.getInterpretation(testId, userId);

    const biomarkers = test.biomarkerResults.map((result) => {
      const status = this.getBiomarkerStatus(
        result.value,
        result.referenceMin,
        result.referenceMax
      );
      return {
        id: result.id,
        code: result.biomarker.code,
        name: result.biomarker.name,
        displayName: this.getDisplayName(result.biomarker.code, result.biomarker.name),
        value: Number(result.value),
        unit: result.unit,
        referenceRange: this.formatReferenceRange(result.referenceMin, result.referenceMax),
        status,
        detail: this.getBiomarkerDetail(result.biomarker.code, status),
      };
    });

    const counts = biomarkers.reduce(
      (acc, biomarker) => {
        if (biomarker.status === 'IN_RANGE') {
          acc.inRange += 1;
        } else if (biomarker.status === 'SLIGHTLY_HIGH') {
          acc.slightlyHigh += 1;
        } else {
          acc.slightlyLow += 1;
        }
        return acc;
      },
      { inRange: 0, slightlyHigh: 0, slightlyLow: 0 }
    );

    return {
      testId,
      intakeAssignment: 'Blood-Enhanced Intake',
      overallHeadline:
        counts.slightlyHigh === 0 && counts.slightlyLow === 0
          ? 'All key markers are in range'
          : 'Mostly within range',
      overallSummary:
        interpretation?.summary ??
        'Most of your key biomarkers are within the optimal ranges, with a few areas to keep an eye on.',
      counts,
      biomarkers,
      featuredBiomarkerCodes: FEATURED_BLOOD_TEST_CODES,
      booking: {
        id: booking?.id ?? null,
        labName: booking?.lab.name ?? test.labPartner?.name ?? 'Partner Lab',
        labAddress: booking?.lab.address ?? null,
        bookingDate: booking ? booking.bookingDate.toISOString() : null,
        timeSlot: booking?.timeSlot ?? null,
      },
    };
  }

  private mapLabToOrderOption(lab: {
    id: string;
    name: string;
    city: string;
    state: string;
    address: string | null;
    serviceTypes: string[];
    resultTimeDays: number;
    operatingDays: unknown;
  }): PublicBloodTestLabOption {
    const operatingDays = this.normalizeOperatingDays(lab.operatingDays);
    const reviewMetadata = DEFAULT_REVIEW_METADATA[lab.name] ?? {
      rating: 4.7,
      reviewCount: 180,
    };

    return {
      id: lab.id,
      name: lab.name,
      city: lab.city,
      state: lab.state,
      address: lab.address,
      addressLine: [lab.address, `${lab.city}, ${lab.state}`].filter(Boolean).join(', '),
      serviceTypes: lab.serviceTypes as LabServiceType[],
      serviceLabel: lab.serviceTypes.includes('HOME_VISIT')
        ? 'Home visit available'
        : 'On-site only',
      resultTimeLabel: this.formatResultTimeLabel(lab.resultTimeDays),
      rating: reviewMetadata.rating,
      reviewCount: reviewMetadata.reviewCount,
      availableDates: this.buildAvailableDates(operatingDays),
    };
  }

  private normalizeOperatingDays(value: unknown): LabOperatingDay[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((day): day is Record<string, unknown> => typeof day === 'object' && day !== null)
      .map((day) => ({
        day: String(day.day ?? ''),
        capacity: Number(day.capacity ?? 0),
        timeSlots: Array.isArray(day.timeSlots)
          ? day.timeSlots
              .filter(
                (slot): slot is Record<string, unknown> => typeof slot === 'object' && slot !== null
              )
              .map((slot) => ({
                start: String(slot.start ?? ''),
                end: String(slot.end ?? ''),
              }))
              .filter((slot) => slot.start && slot.end)
          : [],
      }))
      .filter((day) => day.day && day.timeSlots.length > 0);
  }

  private buildAvailableDates(operatingDays: LabOperatingDay[]): PublicBloodTestDateOption[] {
    const today = this.startOfUtcDay(new Date());
    const dates: PublicBloodTestDateOption[] = [];

    for (let offset = 0; offset < 14 && dates.length < 5; offset += 1) {
      const candidate = this.addUtcDays(today, offset);
      const weekday = DAY_FORMATTER.format(candidate).toUpperCase();
      const matchingDay = operatingDays.find((day) => day.day.toUpperCase() === weekday);
      if (!matchingDay) {
        continue;
      }

      const timeSlots = matchingDay.timeSlots.flatMap((slot) => this.expandTimeSlots(slot));
      if (timeSlots.length === 0) {
        continue;
      }

      dates.push({
        date: candidate.toISOString().slice(0, 10),
        label:
          offset === 0
            ? `Today - ${DATE_LABEL_FORMATTER.format(candidate)}`
            : DATE_LABEL_FORMATTER.format(candidate),
        timeSlots,
      });
    }

    return dates;
  }

  private expandTimeSlots(slot: LabOperatingTimeSlot): PublicBloodTestTimeSlot[] {
    const startHour = this.parseHour(slot.start);
    const endHour = this.parseHour(slot.end);

    if (startHour === null || endHour === null || endHour <= startHour) {
      return [];
    }

    const slots: PublicBloodTestTimeSlot[] = [];
    for (let hour = startHour; hour < endHour; hour += 1) {
      const start = `${String(hour).padStart(2, '0')}:00`;
      const end = `${String(hour + 1).padStart(2, '0')}:00`;
      slots.push({
        id: `${start}-${end}`,
        label: `${this.formatHour(start)}-${this.formatHour(end)}`,
        start,
        end,
      });
    }

    return slots;
  }

  private parseHour(value: string): number | null {
    const match = value.match(/^(\d{1,2}):/);
    if (!match) {
      return null;
    }

    const parsed = Number(match[1]);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 23) {
      return null;
    }

    return parsed;
  }

  private formatHour(value: string): string {
    const [hour, minute] = value.split(':').map((part) => Number(part));
    const date = new Date(Date.UTC(2026, 0, 1, hour, minute));
    return TIME_LABEL_FORMATTER.format(date).replace(':', '.');
  }

  private formatResultTimeLabel(days: number): string {
    if (days <= 2) {
      return 'Result time 1-2 days';
    }

    return `Result time ${days}-${days + 2} days`;
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private addUtcDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private toBookingDate(value: string): Date {
    const parsed = new Date(`${value}T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new ValidationError('Invalid booking date');
    }
    return parsed;
  }

  private normalizeSystemSettings(value: unknown): SystemSettings {
    if (!value || typeof value !== 'object') {
      return {};
    }

    return value as SystemSettings;
  }

  private async storeDemoInterpretation(testId: string): Promise<void> {
    const summary =
      'Most of your key biomarkers are within the optimal ranges, with a few areas to keep an eye on.';
    const keyFindings = [
      {
        biomarkerCode: 'FASTING_GLUCOSE',
        biomarkerName: 'Fasting Glucose',
        value: 105,
        unit: 'mg/dL',
        status: 'HIGH',
        interpretation: 'Fasting glucose is mildly elevated.',
        clinicalSignificance: 'This can be an early sign of reduced glucose control.',
      },
      {
        biomarkerCode: 'IRON',
        biomarkerName: 'Iron',
        value: 48,
        unit: 'mcg/dL',
        status: 'LOW',
        interpretation: 'Serum iron is slightly below range.',
        clinicalSignificance: 'Low iron can contribute to fatigue and lower energy.',
      },
    ];

    const actions = {
      recommendations: [
        {
          category: 'LIFESTYLE',
          priority: 'MEDIUM',
          title: 'Review glucose-supportive habits',
          description: 'Focus on balanced meals, movement after meals, and consistent sleep.',
          rationale: 'Small shifts can improve fasting glucose trends over time.',
          relatedBiomarkers: ['FASTING_GLUCOSE'],
          timeframe: 'Next 4 to 8 weeks',
        },
        {
          category: 'FOLLOW_UP',
          priority: 'MEDIUM',
          title: 'Recheck iron status if symptoms persist',
          description: 'Consider repeat iron studies if fatigue or low stamina continue.',
          rationale: 'Iron trends are often more informative than a single value.',
          relatedBiomarkers: ['IRON'],
          timeframe: 'Next 8 to 12 weeks',
        },
      ],
      riskFactors: ['Mildly elevated fasting glucose', 'Slightly low iron'],
      positiveIndicators: [
        'LDL is in range',
        'hs-CRP is in range',
        'HDL is in range',
        'Vitamin D is in range',
      ],
      followUpSuggestions: ['Continue with a more detailed intake to personalize the next steps.'],
      overallHealthScore: 'GOOD',
      disclaimer:
        'This is educational information and should not replace medical advice from a licensed clinician.',
    };

    await prisma.bloodTestInterpretation.upsert({
      where: { bloodTestId: testId },
      update: {
        summaryEncrypted: encryptionService.encrypt(summary),
        findingsEncrypted: encryptionService.encrypt(JSON.stringify(keyFindings)),
        actionsEncrypted: encryptionService.encrypt(JSON.stringify(actions)),
        tokensUsed: 0,
        modelVersion: 'demo-static-v1',
        promptVersion: 'demo-static-v1',
      },
      create: {
        bloodTestId: testId,
        summaryEncrypted: encryptionService.encrypt(summary),
        findingsEncrypted: encryptionService.encrypt(JSON.stringify(keyFindings)),
        actionsEncrypted: encryptionService.encrypt(JSON.stringify(actions)),
        tokensUsed: 0,
        modelVersion: 'demo-static-v1',
        promptVersion: 'demo-static-v1',
      },
    });
  }

  private getBiomarkerStatus(
    value: { toString(): string },
    referenceMin: { toString(): string } | null,
    referenceMax: { toString(): string } | null
  ): BiomarkerStatus {
    const numericValue = Number(value);
    const min = referenceMin === null ? null : Number(referenceMin);
    const max = referenceMax === null ? null : Number(referenceMax);

    if (min !== null && numericValue < min) {
      return 'SLIGHTLY_LOW';
    }

    if (max !== null && numericValue > max) {
      return 'SLIGHTLY_HIGH';
    }

    return 'IN_RANGE';
  }

  private formatReferenceRange(
    referenceMin: { toString(): string } | null,
    referenceMax: { toString(): string } | null
  ): string {
    const min = referenceMin === null ? null : Number(referenceMin);
    const max = referenceMax === null ? null : Number(referenceMax);

    if (min !== null && max !== null) {
      return `${min} - ${max}`;
    }

    if (max !== null) {
      return `Up to ${max}`;
    }

    if (min !== null) {
      return `${min}+`;
    }

    return 'Custom range';
  }

  private getDisplayName(code: string, fallback: string): string {
    const match = DEMO_BLOOD_TEST_RESULTS.find((result) => result.biomarkerCode === code);
    return match?.displayName ?? fallback;
  }

  private getBiomarkerDetail(code: string, status: BiomarkerStatus): string {
    const match = DEMO_BLOOD_TEST_RESULTS.find((result) => result.biomarkerCode === code);
    if (match) {
      return match.detail;
    }

    if (status === 'SLIGHTLY_HIGH') {
      return 'This marker is slightly above the reference range and may deserve follow-up.';
    }

    if (status === 'SLIGHTLY_LOW') {
      return 'This marker is slightly below the reference range and may deserve follow-up.';
    }

    return 'This marker is currently within the reference range.';
  }

  private getBiomarkersForPanel(panel: string): string[] {
    const map: Record<string, string[]> = {
      targeted: ['TSH', 'VIT_D', 'TESTOSTERONE_TOTAL'],
      'goal-based': ['TSH', 'T4_FREE', 'T3_FREE', 'CORTISOL', 'TESTOSTERONE_TOTAL'],
      comprehensive: ['TSH', 'T4_FREE', 'TESTOSTERONE_TOTAL', 'LIPID_PANEL', 'CBC', 'HBA1C'],
    };
    return map[panel] || [];
  }
}

export const bloodTestService = new BloodTestService();
export default bloodTestService;
