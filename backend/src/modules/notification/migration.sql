-- SQL Migration for MealAI Notification and Like Systems

-- 1. Create recipe_likes table
CREATE TABLE IF NOT EXISTS "recipe_likes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipeId" UUID NOT NULL REFERENCES "recipes"("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "uq_recipe_user_like" UNIQUE("recipeId", "userId")
);

-- 2. Add parentId column to recipe_ratings table for replies, and make rating nullable
ALTER TABLE "recipe_ratings" ADD COLUMN IF NOT EXISTS "parentId" UUID REFERENCES "recipe_ratings"("id") ON DELETE CASCADE;
ALTER TABLE "recipe_ratings" ALTER COLUMN "rating" DROP NOT NULL;

-- 3. Create notifications table for personal notifications
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "actorId" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "postId" UUID REFERENCES "recipes"("id") ON DELETE CASCADE,
  "type" VARCHAR(50) NOT NULL,
  "message" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
