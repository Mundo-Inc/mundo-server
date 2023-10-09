import express from "express";

import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  addCollaborator,
  addCollaboratorValidation,
  addToList,
  addToListValidation,
  createList,
  createListValidation,
  deleteList,
  deleteListValidation,
  removeFromCollaborators,
  removeFromCollaboratorsValidation,
  removeFromList,
  removeFromListValidation,
} from "../controllers/ListController";

const router = express.Router();
router.use(express.json());

router.route("/").post(authMiddleware, createListValidation, createList);

router.route("/:id").delete(authMiddleware, deleteListValidation, deleteList);

router.route("/:id/place").post(authMiddleware, addToListValidation, addToList);
router
  .route("/:id/place/:placeId")
  .delete(authMiddleware, removeFromListValidation, removeFromList);

router
  .route("/:id/collaborator")
  .post(authMiddleware, addCollaboratorValidation, addCollaborator);

router
  .route("/:id/collaborator/:userId")
  .delete(
    authMiddleware,
    removeFromCollaboratorsValidation,
    removeFromCollaborators
  );

export default router;
