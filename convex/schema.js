import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  /* ---------------- USERS ---------------- */
  users: defineTable({
    name: v.string(),
    email: v.string(),
    tokenIdentifier: v.string(),
    imageUrl: v.optional(v.string()),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"])
    .searchIndex("search_name", { searchField: "name" }),

  /* ---------------- GROUPS ---------------- */
  groups: defineTable({
    name: v.string(),
    description: v.optional(v.string()),

    createdBy: v.id("users"),
    createdAt: v.number(),      // <-- REQUIRED

    members: v.array(
      v.object({
        userId: v.union(v.id("users"), v.null()),
        email: v.string(),
        role: v.string(),
        joinedAt: v.number(),
      })
    ),
  }),

  /* ---------------- EXPENSES ---------------- */
  expenses: defineTable({
    description: v.string(),
    amount: v.number(),
    category: v.optional(v.string()),
    date: v.number(),
    paidByUserId: v.id("users"),
    splitType: v.string(),

    splits: v.array(
      v.object({
        userId: v.id("users"),
        amount: v.number(),
        paid: v.boolean(),
      })
    ),

    groupId: v.optional(v.id("groups")),
    createdBy: v.id("users"),
  })
    .index("by_group", ["groupId"])
    .index("by_user_and_group", ["paidByUserId", "groupId"])
    .index("by_date", ["date"]),

  /* ---------------- SETTLEMENTS ---------------- */
  settlements: defineTable({
    amount: v.number(),
    note: v.optional(v.string()),
    date: v.number(),
    paidByUserId: v.id("users"),
    receivedByUserId: v.id("users"),
    groupId: v.optional(v.id("groups")),
    relatedExpenseIds: v.optional(v.array(v.id("expenses"))),
    createdBy: v.id("users"),
  })
    .index("by_group", ["groupId"]),
});