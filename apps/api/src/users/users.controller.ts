import { Controller, Get, Param, Query } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query('take') take = '50', @Query('skip') skip = '0') {
    return this.users.list(Number(take) || 50, Number(skip) || 0);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.users.findById(id);
  }
}
