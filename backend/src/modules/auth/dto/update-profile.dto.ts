import {
  IsOptional,
  IsString,
  IsNumber,
  IsInt,
  IsNotEmpty,
  IsObject,
  ValidateNested,
  IsArray,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

class PreferencesDto {
  @IsOptional()
  @IsString()
  dietType?: string;

  @IsOptional()
  @IsArray()
  allergies?: string[];

  @IsOptional()
  @IsArray()
  dislikedIngredients?: string[];

  @IsOptional()
  @IsArray()
  likedIngredients?: string[];

  @IsOptional()
  @IsArray()
  cuisineTags?: string[];

  @IsOptional()
  @IsNumber()
  maxCookingTime?: number;

  @IsOptional()
  @IsNumber()
  budgetPerMeal?: number;

  @IsNotEmpty({ message: 'Vui lòng nhập số người ăn.' })
  @Type(() => Number)
  @IsInt({ message: 'Số người ăn phải là số nguyên.' })
  @Min(1, { message: 'Số người ăn phải lớn hơn hoặc bằng 1.' })
  @Max(20, { message: 'Số người ăn không được vượt quá 20.' })
  servings: number;

  @IsOptional()
  @IsString()
  healthConditions?: string;

  @IsOptional()
  @IsNumber()
  maxSugarPerMeal?: number;

  @IsOptional()
  @IsNumber()
  maxSodiumPerMeal?: number;

  @IsOptional()
  @IsNumber()
  minProteinPerMeal?: number;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(300)
  weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(250)
  height?: number;

  @IsOptional()
  @IsString()
  activityLevel?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PreferencesDto)
  preferences?: PreferencesDto;
}
