import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { Auth } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CommissionService } from './commission.service';
import { createCommissionRuleSchema, updateCommissionRuleSchema } from './dto/commission.schema';

@Controller('admin/commission-rules')
@Auth('SUPER_ADMIN')
export class CommissionController {
  constructor(private readonly commission: CommissionService) {}

  @Get()
  async list() {
    return { data: await this.commission.listRules() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.commission.getRule(id) };
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createCommissionRuleSchema)) body: any) {
    return { data: await this.commission.createRule(body) };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCommissionRuleSchema)) body: any,
  ) {
    return { data: await this.commission.updateRule(id, body) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { data: await this.commission.deleteRule(id) };
  }
}
