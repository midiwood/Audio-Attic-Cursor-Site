import "server-only";

export {
  clearSpacesClientCache,
  copyObject,
  deleteObject,
  deleteObjectsByPrefix,
  getObjectBuffer,
  headObject,
  listObjectKeys,
  presignGetUrl,
  presignPutUrl,
  spacesConfigured,
  spacesSetupMessage,
  testSpacesConnection,
  uploadObject,
  type DeleteByPrefixResult,
  type PresignGetOptions,
} from "@/lib/storage/spaces-core";
