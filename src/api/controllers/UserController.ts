import { body } from "express-validator";
import type { Request, Response } from "express";

const validate = {
  email: body("email")
    .isEmail()
    .withMessage("Email must be valid")
    .toLowerCase()
    .normalizeEmail()
    .trim()
    .escape(),
  password: body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  name: body("name")
    .trim()
    .isLength({ min: 1 })
    .withMessage("Name is required")
    .escape(),
  username: body("username")
    .optional()
    .trim()
    .isLength({ min: 5 })
    .withMessage("Username must be at least 5 characters long")
    .matches(/^[a-zA-Z0-9_]*$/)
    .withMessage("Username must be alphanumeric")
    .escape(),
};

export const createUserValidator = [
  validate.email,
  validate.password,
  validate.name,
  validate.username,
];
