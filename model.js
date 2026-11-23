import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
  },
  { timestamps: { createdAt: "createdOn", updatedAt: "updatedOn" } }
);

const messageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true },
    message: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: "createdOn", updatedAt: "updatedOn" } }
);

export const userModel = mongoose.models.Users || mongoose.model("Users", userSchema);
export const messageModel = mongoose.models.Messages || mongoose.model("Messages", messageSchema);
