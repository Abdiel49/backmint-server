import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationEntity } from './organization.entity.js';
import { OrganizationService } from './organization.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationEntity])],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationsModule {}
