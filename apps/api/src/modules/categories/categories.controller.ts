import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Auth } from '../../auth/guards/auth.decorator';
import { Role } from '../../auth/roles.enum';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createCategorySchema,
  updateCategorySchema,
} from './dto/category.schema';
import { CategoriesService } from './categories.service';
import { Category } from '@prisma/client';

@Controller()
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get('categories')
  async list(): Promise<Category[]> {
    return this.categories.listTree();
  }

  @Get('categories/:slug')
  async bySlug(@Param('slug') slug: string): Promise<Category> {
    return this.categories.getBySlug(slug);
  }

  @Auth(Role.ADMIN)
  @Post('admin/categories')
  async create(
    @Body(new ZodValidationPipe(createCategorySchema)) body: any,
  ): Promise<Category> {
    return this.categories.create(body);
  }

  @Auth(Role.ADMIN)
  @Patch('admin/categories/:id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: any,
  ): Promise<Category> {
    return this.categories.update(id, body);
  }

  @Auth(Role.ADMIN)
  @Delete('admin/categories/:id')
  async remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}
