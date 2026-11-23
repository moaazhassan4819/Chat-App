import "dotenv/config";
import express from "express";
import bcrypt from "bcryptjs";
import { userModel } from "../model.js";
import jwt from "jsonwebtoken";

const router = express.Router();
const SECRET = process.env.JWT_SECRET || "default_jwt_secret_chat_app";

router.post("/signup", async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).send({ status: "error", message: "Required parameters missing" });
  }

  try {
    const existing = await userModel.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).send({ status: "error", message: "Email is already registered" });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    await userModel.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      password: hash,
    });

    return res.status(201).send({ status: "success", message: `Account created for ${email}. Please log in.` });
  } catch (error) {
    console.error("Signup error:", error);
    if (error.code === 11000) {
      return res.status(400).send({ status: "error", message: "Email is already registered" });
    }
    return res.status(500).send({ status: "error", message: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).send({ status: "error", message: "Email and password are required" });
  }

  try {
    const user = await userModel.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).send({ status: "error", message: "No account found with this email" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).send({ status: "error", message: "Incorrect password" });
    }

    const currentUser = user.toObject();
    delete currentUser.password;

    const token = jwt.sign(currentUser, SECRET, { expiresIn: "24h" });

    res.cookie("Token", token, {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });

    return res.status(200).send({ status: "success", user: currentUser, token });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).send({ status: "error", message: "Internal server error" });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("Token", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
  });
  return res.send({ status: "success", message: "Logged out successfully" });
});

export default router;
