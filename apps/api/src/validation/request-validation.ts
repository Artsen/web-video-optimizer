import type { z, ZodTypeAny } from "zod";
import { validationError } from "./validation-error.js";

type RequestParts = {
  body: unknown;
  params: unknown;
  query: unknown;
};

function parse<TSchema extends ZodTypeAny>(schema: TSchema, value: unknown): z.infer<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseBody<TSchema extends ZodTypeAny>(
  schema: TSchema,
  req: Pick<RequestParts, "body">
): z.infer<TSchema> {
  return parse(schema, req.body);
}

export function parseParams<TSchema extends ZodTypeAny>(
  schema: TSchema,
  req: Pick<RequestParts, "params">
): z.infer<TSchema> {
  return parse(schema, req.params);
}

export function parseRequest<
  TParams extends ZodTypeAny | undefined,
  TBody extends ZodTypeAny | undefined,
  TQuery extends ZodTypeAny | undefined
>(
  schemas: { params?: TParams; body?: TBody; query?: TQuery },
  req: RequestParts
): {
  params: TParams extends ZodTypeAny ? z.infer<TParams> : undefined;
  body: TBody extends ZodTypeAny ? z.infer<TBody> : undefined;
  query: TQuery extends ZodTypeAny ? z.infer<TQuery> : undefined;
} {
  return {
    params: schemas.params ? parse(schemas.params, req.params) : undefined,
    body: schemas.body ? parse(schemas.body, req.body) : undefined,
    query: schemas.query ? parse(schemas.query, req.query) : undefined
  } as {
    params: TParams extends ZodTypeAny ? z.infer<TParams> : undefined;
    body: TBody extends ZodTypeAny ? z.infer<TBody> : undefined;
    query: TQuery extends ZodTypeAny ? z.infer<TQuery> : undefined;
  };
}
