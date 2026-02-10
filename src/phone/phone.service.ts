import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Phone } from './model/phone.schema';
import { PhoneDto } from './dto/phone.dto';

@Injectable()
export class PhoneService {
  constructor(
    @InjectModel('Phone') private readonly phoneModel: Model<Phone>,
  ) {}

  async getPhones(): Promise<Phone[]> {
    try {
      // Utiliza el método find para obtener todos los documentos en la colección
      const phones = await this.phoneModel.find().lean().exec();
      return phones;
    } catch (error) {
      // Maneja cualquier error que pueda ocurrir durante la operación
      throw error;
    }
  }

  async addPhone(phoneDto: PhoneDto): Promise<Phone> {
    try {
      const createdPhone = new this.phoneModel({
        number: phoneDto.number,
        role: phoneDto.role,
      });
      return await createdPhone.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new BadRequestException('El teléfono ya existe');
      }
    }
  }

  async deletePhone(number: string): Promise<void> {
    const result = await this.phoneModel.deleteOne({ number }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException('No se encontró el teléfono');
    }
  }

  async verifyPhone(number: string): Promise<string | false> {
    const phone = await this.phoneModel.findOne({ number });
    return phone ? phone.role : false;
  }
}
