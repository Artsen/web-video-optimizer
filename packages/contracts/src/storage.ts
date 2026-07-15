import { z } from "zod";

export const StoragePressureSchema = z.enum(["normal", "warning", "critical"]);
export type StoragePressure = z.infer<typeof StoragePressureSchema>;

export const StorageAreaUsageDtoSchema = z.object({
  bytes: z.number().finite().nonnegative(),
  fileCount: z.number().int().nonnegative()
});
export type StorageAreaUsageDto = z.infer<typeof StorageAreaUsageDtoSchema>;

export const StorageStatusDtoSchema = z.object({
  managedBytes: z.number().finite().nonnegative(),
  reservedBytes: z.number().finite().nonnegative(),
  availableBytes: z.number().finite().nonnegative().optional(),
  totalFilesystemBytes: z.number().finite().nonnegative().optional(),
  configuredMaxBytes: z.number().finite().nonnegative().optional(),
  minimumFreeBytes: z.number().finite().nonnegative(),
  pressure: StoragePressureSchema,
  areas: z.object({
    uploads: StorageAreaUsageDtoSchema,
    outputs: StorageAreaUsageDtoSchema,
    temporary: StorageAreaUsageDtoSchema,
    staging: StorageAreaUsageDtoSchema
  }),
  cleanup: z.object({
    staleTemporaryBytes: z.number().finite().nonnegative(),
    staleTemporaryFileCount: z.number().int().nonnegative()
  })
});
export type StorageStatusDto = z.infer<typeof StorageStatusDtoSchema>;

export const StorageCleanupResultDtoSchema = z.object({
  removedBytes: z.number().finite().nonnegative(),
  removedFileCount: z.number().int().nonnegative(),
  storage: StorageStatusDtoSchema
});
export type StorageCleanupResultDto = z.infer<typeof StorageCleanupResultDtoSchema>;
