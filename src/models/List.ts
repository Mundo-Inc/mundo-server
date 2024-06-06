import mongoose, { Schema, type Model } from "mongoose";

export enum AccessEnum {
  View = "view",
  Edit = "edit",
}

export interface IList {
  _id: mongoose.Types.ObjectId;
  name: string;
  icon: string;
  places: {
    user: mongoose.Types.ObjectId;
    place: mongoose.Types.ObjectId;
    createdAt: Date;
  }[];
  owner: mongoose.Types.ObjectId;
  collaborators: {
    user: mongoose.Types.ObjectId;
    access: string;
  }[];
  type: string;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ListSchema = new Schema<IList>(
  {
    name: {
      required: true,
      type: String,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    icon: {
      type: String,
      default: "&#11088;",
    },
    places: {
      type: [
        {
          place: {
            type: Schema.Types.ObjectId,
            ref: "Place",
            required: true,
          },
          user: { type: Schema.Types.ObjectId, ref: "User", required: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    collaborators: {
      type: [
        {
          user: {
            type: Schema.Types.ObjectId,
            ref: "User",
          },
          access: {
            type: String,
            default: AccessEnum.Edit,
            enum: Object.values(AccessEnum),
          },
        },
      ],
      default: [],
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

ListSchema.pre("save", function (next) {
  // Check if this is a new document and it doesn't have the owner in the collaborators
  if (this.isNew) {
    const ownerAsCollaborator = this.collaborators.find((collaborator) =>
      collaborator.user.equals(this.owner)
    );
    if (!ownerAsCollaborator) {
      this.collaborators.push({
        user: this.owner,
        access: AccessEnum.Edit,
      });
    }
  }
  next();
});

const List =
  (mongoose.models.List as Model<IList>) ||
  mongoose.model<IList>("List", ListSchema);

export default List;
