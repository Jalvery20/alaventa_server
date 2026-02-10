import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { PhoneDto } from './dto/phone.dto';
import { PhoneService } from './phone.service'; // Asegúrate de importar el servicio
import { AdminGuard } from 'src/guards/admin.guard';

@Controller('phone')
export class PhoneController {
  constructor(private readonly phoneService: PhoneService) {}

  @Get()
  @UseGuards(AdminGuard)
  async getPhones() {
    return this.phoneService.getPhones();
  }

  @Post()
  @UseGuards(AdminGuard)
  async addPhone(@Body(ValidationPipe) phoneDto: PhoneDto) {
    return this.phoneService.addPhone(phoneDto);
  }

  @Delete()
  @UseGuards(AdminGuard)
  async deletePhone(@Body(ValidationPipe) phoneDto: PhoneDto) {
    return this.phoneService.deletePhone(phoneDto.number);
  }
}
