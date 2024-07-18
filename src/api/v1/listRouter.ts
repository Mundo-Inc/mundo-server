import express from "express";

import {
  addCollaborator,
  addCollaboratorValidation,
} from "../controllers/list/addCollaborator.js";
import {
  addToList,
  addToListValidation,
} from "../controllers/list/addToList.js";
import {
  createList,
  createListValidation,
} from "../controllers/list/createList.js";
import {
  deleteList,
  deleteListValidation,
} from "../controllers/list/deleteList.js";
import {
  editCollaboratorAccess,
  editCollaboratorAccessValidation,
} from "../controllers/list/editCollaboratorAccess.js";
import { editList, editListValidation } from "../controllers/list/editList.js";
import { getList, getListValidation } from "../controllers/list/getList.js";
import {
  removeFromCollaborators,
  removeFromCollaboratorsValidation,
} from "../controllers/list/removeFromCollaborators.js";
import {
  removeFromList,
  removeFromListValidation,
} from "../controllers/list/removeFromList.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router.route("/").post(createListValidation, createList);

router
  .route("/:listId")
  .get(getListValidation, getList)
  .put(editListValidation, editList)
  .delete(deleteListValidation, deleteList);

router
  .route("/:listId/place/:placeId")
  .post(addToListValidation, addToList)
  .delete(removeFromListValidation, removeFromList);

router
  .route("/:listId/collaborator/:userId")
  .post(addCollaboratorValidation, addCollaborator)
  .delete(removeFromCollaboratorsValidation, removeFromCollaborators)
  .put(editCollaboratorAccessValidation, editCollaboratorAccess);

export default router;
