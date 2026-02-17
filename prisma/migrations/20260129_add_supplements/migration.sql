-- CreateEnum
CREATE TYPE "SupplementCategory" AS ENUM ('VITAMIN', 'MINERAL', 'HERB', 'AMINO_ACID', 'PROBIOTIC', 'OMEGA', 'ENZYME', 'ADAPTOGEN', 'LIFESTYLE_CHANGE', 'OTHER');

-- CreateTable
CREATE TABLE "supplements" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "category" "SupplementCategory" NOT NULL,
    "evidence_level" TEXT,
    "primary_benefits" TEXT[],
    "recommended_dosage" TEXT,
    "dosage_unit" TEXT,
    "frequency" TEXT,
    "target_symptoms" TEXT[],
    "target_goals" TEXT[],
    "target_biomarkers" TEXT[],
    "min_age" INTEGER,
    "max_age" INTEGER,
    "allowed_genders" "Gender"[],
    "contraindications" TEXT[],
    "interactions" TEXT[],
    "side_effects" TEXT[],
    "safety_notes" TEXT,
    "affiliate_links" JSONB,
    "average_price" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplement_matches" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "recommendation_id" UUID NOT NULL,
    "supplement_id" UUID NOT NULL,
    "match_score" INTEGER NOT NULL,
    "match_reason" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "personalized_dosage" TEXT,
    "expected_benefit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "viewed_at" TIMESTAMP(3),
    "purchased_at" TIMESTAMP(3),
    "affiliate_clicked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplement_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplements_slug_key" ON "supplements"("slug");

-- CreateIndex
CREATE INDEX "supplements_category_idx" ON "supplements"("category");

-- CreateIndex
CREATE INDEX "supplements_slug_idx" ON "supplements"("slug");

-- CreateIndex
CREATE INDEX "supplements_is_active_idx" ON "supplements"("is_active");

-- CreateIndex
CREATE INDEX "supplements_target_symptoms_idx" ON "supplements"("target_symptoms");

-- CreateIndex
CREATE INDEX "supplements_target_goals_idx" ON "supplements"("target_goals");

-- CreateIndex
CREATE UNIQUE INDEX "supplement_matches_recommendation_id_supplement_id_key" ON "supplement_matches"("recommendation_id", "supplement_id");

-- CreateIndex
CREATE INDEX "supplement_matches_recommendation_id_idx" ON "supplement_matches"("recommendation_id");

-- CreateIndex
CREATE INDEX "supplement_matches_supplement_id_idx" ON "supplement_matches"("supplement_id");

-- CreateIndex
CREATE INDEX "supplement_matches_status_idx" ON "supplement_matches"("status");

-- AddForeignKey
ALTER TABLE "supplement_matches" ADD CONSTRAINT "supplement_matches_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplement_matches" ADD CONSTRAINT "supplement_matches_supplement_id_fkey" FOREIGN KEY ("supplement_id") REFERENCES "supplements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
