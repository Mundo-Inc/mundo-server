import mongoose, { Schema, Document, Mongoose } from "mongoose";

export enum AccessEnum {
  view = "view",
  edit = "edit",
}

export interface IList extends Document {
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
    collaborators: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        access: {
          type: String,
          default: AccessEnum.edit,
          enum: Object.values(AccessEnum),
        },
      },
    ],
    isPrivate: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

ListSchema.pre<IList>("save", function (next) {
  // Check if this is a new document and it doesn't have the owner in the collaborators
  if (this.isNew) {
    const ownerAsCollaborator = this.collaborators.find((collaborator) =>
      collaborator.user.equals(this.owner)
    );
    if (!ownerAsCollaborator) {
      this.collaborators.push({
        user: this.owner,
        access: AccessEnum.edit,
      });
    }
  }
  next();
});

export default mongoose.models.List ||
  mongoose.model<IList>("List", ListSchema);
