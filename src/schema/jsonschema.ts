import { z } from "zod";
import { ProjectSchema } from "./project.js";
import { OpSchema } from "./ops.js";

const clean = (schema: Record<string, unknown>) => {
  delete schema.$schema;
  return schema;
};

/** JSON Schema of a project (input side). Handy for validating projects outside JavaScript, or for giving an AI the format. */
export function projectJsonSchema(): Record<string, unknown> {
  return clean(z.toJSONSchema(ProjectSchema, { io: "input" }) as Record<string, unknown>);
}

/** JSON Schema of one op (input side). */
export function opJsonSchema(): Record<string, unknown> {
  return clean(z.toJSONSchema(OpSchema, { io: "input" }) as Record<string, unknown>);
}
