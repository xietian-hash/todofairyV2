import { IsOptional, IsString, MaxLength } from "class-validator";

export class WechatLoginDto {
  @IsString()
  @MaxLength(128)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  devOpenId?: string;
}
