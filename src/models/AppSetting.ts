import mongoose, { Schema, type Document } from "mongoose";

export interface IAppSetting extends Document {
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

const AppSettingSchema = new Schema<IAppSetting>(
  {
    key: {
      type: String,
      required: true,
      index: true,
    },
    value: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.AppSetting ||
  mongoose.model<IAppSetting>("AppSetting", AppSettingSchema);
