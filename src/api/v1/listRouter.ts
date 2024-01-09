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
  editCollaboratorAccess,
  editCollaboratorAccessValidation,
  editList,
  editListValidation,
  getList,
  getListValidation,
  removeFromCollaborators,
  removeFromCollaboratorsValidation,
  removeFromList,
  removeFromListValidation,
} from "../controllers/ListController";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

// Create a list ✅
router.route("/").post(createListValidation, createList);

// Get a list ✅
// Edit a list
// Delete a list ✅
router
  .route("/:id")
  .get(getListValidation, getList)
  .put(editListValidation, editList)
  .delete(deleteListValidation, deleteList);

// Add to list ✅
// Remove place from the list ✅
router
  .route("/:id/place/:placeId")
  .post(addToListValidation, addToList)
  .delete(removeFromListValidation, removeFromList);

// Add collaborator to a list ✅
// Edit collaborator ✅
// Remove collaborator ✅
router
  .route("/:id/collaborator/:userId")
  .post(addCollaboratorValidation, addCollaborator)
  .delete(removeFromCollaboratorsValidation, removeFromCollaborators)
  .put(editCollaboratorAccessValidation, editCollaboratorAccess);

export default router;
