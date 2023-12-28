export const getListOfListsDTO = {
  _id: 1,
  name: 1,
  owner: 1,
  icon: 1,
  collaboratorsCount: { $size: "$collaborators" },
  placesCount: { $size: "$places" },
  isPrivate: 1,
  createdAt: 1,
};
