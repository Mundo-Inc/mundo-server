import mongoose, { Schema, type Model } from "mongoose";

export interface IAppSetting {
  _id: mongoose.Types.ObjectId;
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

const AppSetting =
  (mongoose.models.AppSetting as Model<IAppSetting>) ||
  mongoose.model<IAppSetting>("AppSetting", AppSettingSchema);

export default AppSetting;
