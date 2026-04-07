import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Model } from 'mongoose';
import { StoreDetails } from './store.details.schema';
import { Product } from '../../product/model/product.schema';

// ============================================
// USER SCHEMA
// ============================================

@Schema({
  strict: false,
  timestamps: true, // Añade createdAt y updatedAt automáticamente
  toJSON: {
    virtuals: true,
    transform: (_, ret) => {
      //delete ret.password;
      delete ret.__v;
      return ret;
    },
  },
})
export class User extends Document {
  @Prop({ minlength: 4, maxlength: 100 })
  name: string;

  @Prop({ minlength: 3, maxlength: 50, default: 'Villa Clara' })
  province: string;

  @Prop({ minlength: 3, maxlength: 50, default: 'Santa Clara' })
  municipality: string;

  @Prop({
    required: true,
    enum: ['administrador', 'vendedor', 'tienda'],
    default: 'vendedor',
  })
  role: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  phoneNumber: string;

  @Prop()
  address: string;

  @Prop({
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop()
  expiryDate: Date;

  @Prop()
  isAllowed: boolean;

  // Atributos específicos para el rol de 'tienda'
  @Prop({ type: Object, default: {} })
  storeDetails: StoreDetails;

  // Timestamps automáticos
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// ============================================
// CONFIGURAR toObject
// ============================================

UserSchema.set('toObject', {
  virtuals: true,
  transform: (_, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

// ============================================
// MIDDLEWARES
// ============================================

UserSchema.post('findOneAndDelete', async function (doc, next) {
  if (doc) {
    const productModel: Model<Product> = (this as any).model.db.model(
      'Product',
    );
    await productModel.deleteMany({ seller: doc._id });
  }
  next();
});

// Middleware de pre-guardado
UserSchema.pre('save', function (next) {
  handleRoleAndCategories.call(this);
  next();
});

// Middleware de pre-actualización
UserSchema.pre('updateOne', function (next) {
  handleRoleAndCategories.call(this);
  next();
});

function handleRoleAndCategories(this: any) {
  // Para el rol de administrador, no establecer expiryDate ni isAllowed
  if (this.role === 'administrador') {
    delete this.expiryDate;
    delete this.isAllowed;
  } else {
    // Para otros roles, establecer expiryDate y isAllowed según corresponda
    this.isAllowed = this.isAllowed !== undefined ? this.isAllowed : true;
    // Asegúrate de que expiryDate se establezca solo si no existe
    if (!this.expiryDate) {
      const now = new Date();
      now.setDate(now.getDate() + 31);
      this.expiryDate = now;
    }
  }

  // Para el rol de 'tienda', establecer los atributos específicos
  if (this.role === 'tienda') {
    this.storeDetails = {
      categories: this.storeDetails?.categories || [],
      storePic: this.storeDetails?.storePic || '',
      description: this.storeDetails?.description || '',
      schedule: this.storeDetails?.schedule || [],
      delivery: this.storeDetails?.delivery ?? null,
      contact: this.storeDetails?.contact || [],
      paymentMethods: this.storeDetails?.paymentMethods || [],
      is24Hours: this.storeDetails?.is24Hours || false,
    };
  } else {
    // Para otros roles, eliminar los atributos específicos de 'tienda'
    this.storeDetails = {};
  }
}

// ============================================
// ÍNDICES
// ============================================

UserSchema.index({ phoneNumber: 1 }, { unique: true });
UserSchema.index(
  { email: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { email: { $exists: true, $ne: null } },
  },
);
UserSchema.index({ role: 1, isAllowed: 1, province: 1 });
UserSchema.index({ name: 1, isAllowed: 1 });
UserSchema.index({ province: 1, municipality: 1 });
