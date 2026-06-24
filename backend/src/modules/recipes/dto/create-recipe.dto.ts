import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  IsBoolean,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  normalizeRecipeIngredients,
  normalizeRecipeSteps,
} from '../recipe-normalization.util';

class StepDto {
  @IsInt()
  step: number;

  @IsString()
  @IsNotEmpty()
  description: string;
}

class IngredientItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  quantity: number;

  @IsString()
  @IsNotEmpty()
  unit: string;

  @IsBoolean()
  @IsOptional()
  isOptional?: boolean;
}

const toStepDto = (step: StepDto): StepDto => Object.assign(new StepDto(), step);

const toIngredientItemDto = (ingredient: IngredientItemDto): IngredientItemDto =>
  Object.assign(new IngredientItemDto(), ingredient);

export class CreateRecipeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsInt()
  @Min(1)
  cookingTime: number;

  @IsInt()
  @IsOptional()
  servings?: number;

  @IsString()
  @IsOptional()
  difficulty?: string;

  @IsInt()
  @Min(0)
  calories: number;

  @IsNumber()
  @IsOptional()
  protein?: number;

  @IsNumber()
  @IsOptional()
  carbs?: number;

  @IsNumber()
  @IsOptional()
  fat?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  mealType?: string[];

  @IsString()
  @IsOptional()
  cuisineRegion?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepDto)
  @Transform(({ value }) => normalizeRecipeSteps(value).map(toStepDto), {
    toClassOnly: true,
  })
  steps: StepDto[];

  @IsNumber()
  @IsOptional()
  estimatedCost?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngredientItemDto)
  @Transform(({ value }) => normalizeRecipeIngredients(value).map(toIngredientItemDto), {
    toClassOnly: true,
  })
  @IsOptional()
  ingredients?: IngredientItemDto[];
}

export class RejectRecipeDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
