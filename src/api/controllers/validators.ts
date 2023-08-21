import { type ValidationChain } from "express-validator";
import strings from "../../strings";

const validate = {
  email: (start: ValidationChain) =>
    start
      .isEmail()
      .withMessage("Email must be valid")
      .toLowerCase()
      .normalizeEmail()
      .trim(),

  password: (start: ValidationChain) =>
    start
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long"),

  name: (start: ValidationChain) =>
    start.trim().isLength({ min: 1 }).withMessage("Name is required").escape(),

  bio: (start: ValidationChain) => start.trim().escape(),

  username: (start: ValidationChain) =>
    start
      .trim()
      .isLength({ min: 5, max: 20 })
      .withMessage(strings.validations.invalidUsernameLength)
      .matches(/^[a-zA-Z0-9_]*$/)
      .withMessage(strings.validations.invalidUsername)
      .escape(),

  q: (start: ValidationChain) =>
    start.trim().isLength({ min: 1 }).withMessage("Query is required"),

  page: (start: ValidationChain, max?: number) =>
    max
      ? start
          .isInt({ min: 1, max })
          .withMessage(`Page must be between 1 and ${max}`)
      : start
          .isInt({ min: 1 })
          .withMessage("Page must be greater than or equal to 1"),

  limit: (start: ValidationChain, min: number, max: number) =>
    start
      .isInt({ min, max })
      .withMessage(`Limit must be between ${min} and ${max}`),

  lat: (start: ValidationChain) =>
    start
      .isFloat({ min: -90, max: 90 })
      .withMessage("Latitude must be between -90 and 90"),

  lng: (start: ValidationChain) =>
    start
      .isFloat({ min: -180, max: 180 })
      .withMessage("Longitude must be between -180 and 180"),

  place: {
    description: (start: ValidationChain) =>
      start
        .trim()
        .isLength({ min: 1, max: 500 })
        .withMessage("Description must be between 1 and 500 characters long")
        .escape(),

    priceRange: (start: ValidationChain) =>
      start
        .isInt({ min: 1, max: 5 })
        .withMessage("Price range must be between 1 and 5"),

    // TODO: Implement this
    categories: (start: ValidationChain) =>
      start
        .isArray({ min: 1, max: 5 })
        .withMessage("Categories must be between 1 and 5"),
  },
};

export default validate;
