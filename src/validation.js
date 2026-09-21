const { z } = require("zod");

const categories = ["Security", "Harassment", "Corruption", "Technical", "Other"];
const statuses = ["SUBMITTED", "UNDER_REVIEW", "RESOLVED", "DISMISSED"];

const reportSchema = z.object({
  category: z.enum(categories),
  description: z.string().trim().min(10).max(10000),
  evidenceUrl: z.string().trim().url().max(2048).optional().nullable()
}).strict();

const trackSchema = z.object({
  caseCode: z.string().regex(/^[A-Za-z0-9_-]{32}$/)
}).strict();

const statusSchema = z.object({
  status: z.enum(["UNDER_REVIEW", "RESOLVED", "DISMISSED"]),
  message: z.string().trim().min(1).max(1000)
}).strict();

module.exports = { categories, statuses, reportSchema, trackSchema, statusSchema };
