import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, Category } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { slugify, randomSuffix } from '../../common/utils/slug';
import {
  CreateCategoryInput,
  UpdateCategoryInput,
} from './dto/category.schema';

type CategoryNode = Category & { children: CategoryNode[]; subCount: number };

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedIfEmpty();
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const slug = input.slug ?? `${slugify(input.name)}-${randomSuffix(4)}`;
    if (input.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: input.parentId },
      });
      if (!parent) throw new NotFoundException('Parent category not found');
    }
    try {
      return await this.prisma.category.create({
        data: {
          name: input.name,
          slug,
          description: input.description,
          parentId: input.parentId ?? null,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Category slug already exists');
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');
    if (input.parentId) {
      if (input.parentId === id) {
        throw new ConflictException('Category cannot be its own parent');
      }
      const parent = await this.prisma.category.findUnique({
        where: { id: input.parentId },
      });
      if (!parent) throw new NotFoundException('Parent category not found');
    }
    try {
      return await this.prisma.category.update({
        where: { id },
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          parentId: input.parentId,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Category slug already exists');
      }
      throw err;
    }
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.category.findUnique({
      where: { id },
      include: {
        children: true,
        services: true,
        providerCategories: true,
        providerServices: true,
      },
    });
    if (!existing) throw new NotFoundException('Category not found');
    if (existing.children.length > 0) {
      throw new ConflictException(
        'Cannot delete a category that has subcategories',
      );
    }
    if (existing.services.length > 0 || existing.providerServices.length > 0) {
      throw new ConflictException(
        'Cannot delete a category that is used by services',
      );
    }
    if (existing.providerCategories.length > 0) {
      throw new ConflictException(
        'Cannot delete a category assigned to providers',
      );
    }
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }

  async listTree(): Promise<CategoryNode[]> {
    const all = await this.prisma.category.findMany({
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    });
    return this.buildTree(all);
  }

  async getBySlug(slug: string): Promise<CategoryNode> {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    if (!category) throw new NotFoundException('Category not found');
    const all = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    return this.buildTree(all, category.id)[0];
  }

  private buildTree(
    all: Category[],
    rootId?: string,
  ): CategoryNode[] {
    const map = new Map<string, CategoryNode>();
    for (const c of all) {
      map.set(c.id, { ...c, children: [], subCount: 0 });
    }
    const roots: CategoryNode[] = [];
    for (const c of all) {
      const node = map.get(c.id)!;
      if (c.parentId && map.has(c.parentId)) {
        map.get(c.parentId)!.children.push(node);
        let p = map.get(c.parentId);
        while (p) {
          p.subCount++;
          p = p.parentId ? map.get(p.parentId) : undefined;
        }
      } else if (!rootId) {
        roots.push(node);
      } else if (c.id === rootId) {
        roots.push(node);
      }
    }
    return roots;
  }

  private async seedIfEmpty(): Promise<void> {
    const count = await this.prisma.category.count();
    if (count > 0) return;

    const taxonomy: Record<string, string[]> = {
      Hair: ['Braids', 'Weaves', 'Natural Hair', 'Locs', 'Haircuts', 'Coloring'],
      Makeup: ['Bridal Makeup', 'Editorial Makeup', 'Everyday Makeup'],
      Nails: ['Manicure', 'Pedicure', 'Nail Art', 'Acrylics', 'Gel Extensions'],
      Skincare: ['Facials', 'Peels', 'Microneedling', 'Waxing'],
      Barber: ['Fade', 'Beard Trim', 'Hot Towel Shave', 'Kids Cuts'],
      Massage: ['Swedish', 'Deep Tissue', 'Sports', 'Reflexology'],
      'Beauty Tools': ['Brushes', 'Mirrors', 'Styling Tools', 'Accessories'],
    };

    const created: Record<string, string> = {};
    for (const [parent, children] of Object.entries(taxonomy)) {
      const p = await this.prisma.category.create({
        data: {
          name: parent,
          slug: slugify(parent),
          description: `${parent} services`,
        },
      });
      created[parent] = p.id;
      for (const child of children) {
        await this.prisma.category.create({
          data: {
            name: child,
            slug: `${slugify(parent)}-${slugify(child)}`,
            parentId: p.id,
            description: `${child} under ${parent}`,
          },
        });
      }
    }
  }
}
