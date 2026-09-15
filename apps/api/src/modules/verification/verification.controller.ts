import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VerificationService } from './verification.service';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  submitVerificationSchema,
  reviewVerificationSchema,
  listVerificationsSchema,
  type SubmitVerificationInput,
  type ReviewVerificationInput,
  type ListVerificationsInput,
} from './dto/verification.schema';

@Controller()
export class VerificationController {
  constructor(
    private readonly verification: VerificationService,
  ) {}

  // --- provider self-service ----------------------------------------------

  @Post('providers/me/verification/submit')
  @Auth('PROVIDER')
  async submit(@CurrentUser() user: { sub: string }, @Body(new ZodValidationPipe(submitVerificationSchema)) dto: SubmitVerificationInput) {
    return { data: await this.verification.submit(user.sub, dto) };
  }

  @Get('providers/me/verification')
  @Auth('PROVIDER')
  async getOwn(@CurrentUser() user: { sub: string }) {
    return { data: await this.verification.getOwn(user.sub) };
  }

  @Post('providers/me/verification/documents')
  @Auth('PROVIDER')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @CurrentUser() user: { sub: string },
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname?: string } | undefined,
    @Body() body: { kind?: string },
  ) {
    if (!file) throw new Error('No file provided');
    if (!body.kind) throw new Error('Document kind is required');
    return await this.verification.uploadDocument(user.sub, file, body.kind);
  }

  // --- admin dashboard ----------------------------------------------------

  @Get('admin/verifications')
  @Auth('ADMIN', 'SUPER_ADMIN')
  async listForAdmin(@Query(new ZodValidationPipe(listVerificationsSchema)) filters: ListVerificationsInput) {
    return await this.verification.listForAdmin(filters);
  }

  @Get('admin/verifications/:providerId')
  @Auth('ADMIN', 'SUPER_ADMIN')
  async getForAdmin(@Param('providerId') providerId: string) {
    return { data: await this.verification.getForAdmin(providerId) };
  }

  @Post('admin/verifications/:providerId/review')
  @Auth('ADMIN', 'SUPER_ADMIN')
  async review(
    @CurrentUser() actor: { sub: string },
    @Param('providerId') providerId: string,
    @Body(new ZodValidationPipe(reviewVerificationSchema)) dto: ReviewVerificationInput,
  ) {
    const result = await this.verification.review(actor.sub, providerId, dto);
    return { data: result };
  }

  @Get('admin/verifications/:providerId/documents/:docId/url')
  @Auth('ADMIN', 'SUPER_ADMIN')
  async documentUrl(@CurrentUser() actor: { sub: string }, @Param('providerId') providerId: string, @Param('docId') docId: string) {
    return await this.verification.getDocumentSignedUrl(providerId, docId, actor.sub);
  }
}
