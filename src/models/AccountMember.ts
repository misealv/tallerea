import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAccountMember extends Document {
  accountId: Types.ObjectId;
  userId: Types.ObjectId;
  rol: 'owner' | 'instructor' | 'admin_espacio';
  nombre: string;
  bio?: string;
  especialidades?: string[];
  invitadoEn: Date;
  aceptado: boolean;
  activo: boolean;
}

const AccountMemberSchema = new Schema<IAccountMember>({
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  rol: { type: String, enum: ['owner', 'instructor', 'admin_espacio'], required: true },
  nombre: { type: String, required: true, trim: true },
  bio: { type: String },
  especialidades: [{ type: String, enum: ['visual', 'teatro', 'danza', 'musica', 'otro'] }],
  invitadoEn: { type: Date, default: Date.now },
  aceptado: { type: Boolean, default: false },
  activo: { type: Boolean, default: true },
}, { timestamps: true });

AccountMemberSchema.index({ accountId: 1 });
AccountMemberSchema.index({ userId: 1 });
AccountMemberSchema.index({ accountId: 1, userId: 1 }, { unique: true });

export default mongoose.models.AccountMember || mongoose.model<IAccountMember>('AccountMember', AccountMemberSchema);
