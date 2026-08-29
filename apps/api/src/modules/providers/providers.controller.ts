import {
  Body,
  Controller,
  Delete,
  FileInterceptor,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { ProvidersService } from './providers.service';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createProviderProfileSchema,
  updateProviderProfileSchema,
  setProviderCategoriesSchema,
  createProviderServiceSchema,
  updateProviderServiceSchema,
  createPortfolioItemSchema,
  updatePortfolioItemSchema,
  listProvidersSchema,
  type CreateProviderProfileInput,
  type UpdateProviderProfileInput,
  type SetProviderCategoriesInput,
  type CreateProviderServiceInput,
  type UpdateProviderServiceInput,
  type CreatePortfolioItemInput,
  type UpdatePortfolioItemInput,
  type ListProvidersInput,
} from './dto/provider.schema';

@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly providers: ProvidersService,
    private readonly audit: AuditService,
  ) {}

  // --- self-service (provider only) ---------------------------------------

  @Post('me')
  @Auth('PROVIDER')
  async create(@CurrentUser() user: { sub: string }, @Body(new ZodValidationPipe(createProviderProfileSchema)) dto: CreateProviderProfileInput, @Req() req: ExpressRequest) {
    const result = await this.providers.createProfile(user.sub, dto);
    return { data: result };
  }

  @Get('me')
  @Auth('PROVIDER')
  async me(@CurrentUser() user: { sub: string }) {
    return { data: await this.providers.getOwnProfile(user.sub) };
  }

  @Patch('me')
  @Auth('PROVIDER')
  async update(@CurrentUser() user: { sub: string }, @Body(new ZodValidationPipe(updateProviderProfileSchema)) dto: UpdateProviderProfileInput, @Req() req: ExpressRequest) {
    return { data: await this.providers.updateProfile(user.sub, dto) };
  }

  @Put('me/categories')
  @Auth('PROVIDER')
  async setCategories(@CurrentUser() user: { sub: string }, @Body(new ZodValidationPipe(setProviderCategoriesSchema)) dto: SetProviderCategoriesInput) {
    return { data: await this.providers.setCategories(user.sub, dto) };
  }

  @Get('me/categories')
  @Auth('PROVIDER')
  async getCategories(@CurrentUser() user: { sub: string }) {
    return { data: await this.providers.getCategories(user.sub) };
  }

  @Get('me/services')
  @Auth('PROVIDER')
  async listServices(@CurrentUser() user: { sub: string }) {
    return { data: await this.providers.listServices(user.sub) };
  }

  @Post('me/services')
  @Auth('PROVIDER')
  async createService(@CurrentUser() user: { sub: string }, @Body(new ZodValidationPipe(createProviderServiceSchema)) dto: CreateProviderServiceInput) {
    return { data: await this.providers.createService(user.sub, dto) };
  }

  @Get('me/services/:id')
  @Auth('PROVIDER')
  async getService(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return { data: await this.providers.getService(user.sub, id) };
  }

  @Patch('me/services/:id')
  @Auth('PROVIDER')
  async updateService(@CurrentUser() user: { sub: string }, @Param('id') id: string, @Body(new ZodValidationPipe(updateProviderServiceSchema)) dto: UpdateProviderServiceInput) {
    return { data: await this.providers.updateService(user.sub, id, dto) };
  }

  @Delete('me/services/:id')
  @Auth('PROVIDER')
  async deleteService(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return await this.providers.deleteService(user.sub, id);
  }

  @Post('me/portfolio')
  @Auth('PROVIDER')
  async createPortfolio(@CurrentUser() user: { sub: string }, @Body(new ZodValidationPipe(createPortfolioItemSchema)) dto: CreatePortfolioItemInput) {
    return { data: await this.providers.createPortfolioItem(user.sub, dto) };
  }

  @Get('me/portfolio')
  @Auth('PROVIDER')
  async listPortfolio(@CurrentUser() user: { sub: string }) {
    return { data: await this.providers.listPortfolio(user.sub) };
  }

  @Patch('me/portfolio/:id')
  @Auth('PROVIDER')
  async updatePortfolio(@CurrentUser() user: { sub: string }, @Param('id') id: string, @Body(new ZodValidationPipe(updatePortfolioItemSchema)) dto: UpdatePortfolioItemInput) {
    return { data: await this.providers.updatePortfolioItem(user.sub, id, dto) };
  }

  @Delete('me/portfolio/:id')
  @Auth('PROVIDER')
  async deletePortfolio(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return await this.providers.deletePortfolioItem(user.sub, id);
  }

  @Post('me/media')
  @Auth('PROVIDER')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(@CurrentUser() user: { sub: string }, @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname?: string } | undefined) {
    if (!file) throw new Error('No file provided');
    return await this.providers.uploadMedia(user.sub, file);
  }

  // --- public read (no auth) ----------------------------------------------

  @Get()
  async list(@Query(new ZodValidationPipe(listProvidersSchema)) filters: ListProvidersInput) {
    return await this.providers.listProviders(filters);
  }

  @Get(':slug')
  async publicProfile(@Param('slug') slug: string) {
    return { data: await this.providers.getPublicProfile(slug) };
  }
}
