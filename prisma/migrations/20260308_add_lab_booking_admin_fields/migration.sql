ALTER TABLE "lab_bookings"
ADD COLUMN "admin_notes" TEXT,
ADD COLUMN "result_file_name" TEXT,
ADD COLUMN "result_file_type" TEXT,
ADD COLUMN "result_uploaded_at" TIMESTAMP(3),
ADD COLUMN "result_reviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reviewed_at" TIMESTAMP(3);
