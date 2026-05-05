import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createHash } from "crypto";
import { ERROR_CODES } from "../common/constants/error-codes";
import { PrismaService } from "../common/database/prisma.service";
import { AppException } from "../common/exceptions/app.exception";
import { AuthUser } from "../common/types/request-context";
import { WechatLoginDto } from "./dto/wechat-login.dto";

type WechatSessionResponse = {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

const WECHAT_PROVIDER = "wechat_miniprogram";

@Injectable()
export class AuthService {
  private readonly tokenExpiresIn = "12h";

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async wechatLogin(body: WechatLoginDto) {
    const openid = await this.resolveOpenId(body);
    const now = Date.now();
    const identityKey = openid;

    const user = await this.prisma.$transaction(async (tx) => {
      const existingIdentity = await tx.userIdentity.findUnique({
        where: {
          provider_identityKey: {
            provider: WECHAT_PROVIDER,
            identityKey,
          },
        },
        include: {
          user: true,
        },
      });

      if (existingIdentity?.user) {
        const updatedUser = await tx.user.update({
          where: { id: existingIdentity.user.id },
          data: {
            nickname: body.nickname?.trim() || existingIdentity.user.nickname,
            avatarUrl: body.avatarUrl?.trim() || existingIdentity.user.avatarUrl,
            lastLoginAt: BigInt(now),
            updatedAt: BigInt(now),
          },
        });
        await tx.userIdentity.update({
          where: { id: existingIdentity.id },
          data: {
            openid,
            updatedAt: BigInt(now),
          },
        });
        return updatedUser;
      }

      const userId = this.buildUserId(openid);
      const createdUser = await tx.user.create({
        data: {
          id: userId,
          nickname: body.nickname?.trim() || "",
          avatarUrl: body.avatarUrl?.trim() || "",
          status: 1,
          lastLoginAt: BigInt(now),
          createdAt: BigInt(now),
          updatedAt: BigInt(now),
        },
      });
      await tx.userIdentity.create({
        data: {
          userId,
          provider: WECHAT_PROVIDER,
          identityKey,
          openid,
          unionid: "",
          createdAt: BigInt(now),
          updatedAt: BigInt(now),
        },
      });
      return createdUser;
    });

    const token = await this.jwtService.signAsync(
      {
        userId: user.id,
        openid,
      },
      {
        secret: this.getJwtSecret(),
        expiresIn: this.tokenExpiresIn,
      }
    );

    return {
      token,
      expiresIn: this.tokenExpiresIn,
      user: {
        userId: user.id,
        nickname: user.nickname || "",
        avatarUrl: user.avatarUrl || "",
      },
    };
  }

  verifyBearerToken(authHeader: string): AuthUser {
    const [type, token] = authHeader.split(" ");
    if (!type || !token || type.toLowerCase() !== "bearer") {
      throw new AppException(401, ERROR_CODES.UNAUTHORIZED, "登录状态已失效，请重新登录");
    }
    try {
      const payload = this.jwtService.verify<AuthUser>(token, {
        secret: this.getJwtSecret(),
      });
      return {
        userId: payload.userId,
        openid: payload.openid,
      };
    } catch {
      throw new AppException(401, ERROR_CODES.UNAUTHORIZED, "登录状态已失效，请重新登录");
    }
  }

  private getJwtSecret() {
    return this.configService.get<string>("JWT_SECRET") || "todo-fairy-dev-secret";
  }

  private buildUserId(openid: string) {
    return createHash("sha1").update(openid).digest("hex").slice(0, 24);
  }

  private async resolveOpenId(body: WechatLoginDto) {
    if (body.devOpenId) {
      return body.devOpenId;
    }
    if (body.code.startsWith("dev:")) {
      return body.code.slice(4);
    }

    const appId = this.configService.get<string>("WECHAT_APPID") || "";
    const secret = this.configService.get<string>("WECHAT_SECRET") || "";
    if (!appId || !secret) {
      throw new AppException(
        401,
        ERROR_CODES.UNAUTHORIZED,
        "未配置微信登录环境变量，开发环境可使用 devOpenId 或 dev:openid 方式登录"
      );
    }

    const url =
      "https://api.weixin.qq.com/sns/jscode2session" +
      `?appid=${encodeURIComponent(appId)}` +
      `&secret=${encodeURIComponent(secret)}` +
      `&js_code=${encodeURIComponent(body.code)}` +
      "&grant_type=authorization_code";

    const response = await fetch(url);
    if (!response.ok) {
      throw new AppException(401, ERROR_CODES.UNAUTHORIZED, "微信登录失败，请稍后重试");
    }

    const payload = (await response.json()) as WechatSessionResponse;
    if (!payload.openid) {
      throw new AppException(401, ERROR_CODES.UNAUTHORIZED, payload.errmsg || "无法获取微信身份信息");
    }
    return payload.openid;
  }
}
