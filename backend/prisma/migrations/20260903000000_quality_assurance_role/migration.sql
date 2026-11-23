-- Commit the enum extension before the following migration inserts the role.
ALTER TYPE "RoleName" ADD VALUE IF NOT EXISTS 'QUALITY_ASSURANCE';
