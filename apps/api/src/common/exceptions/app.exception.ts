import { HttpException } from "@nestjs/common";
import { ErrorCode } from "../constants/error-codes";

export class AppException extends HttpException {
  constructor(
    readonly httpStatus: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown
  ) {
    super(message, httpStatus);
  }
}
