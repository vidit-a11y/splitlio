import { query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ---------------------------------------------
// GET GROUP EXPENSES
// ---------------------------------------------
export const getGroupExpenses = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const currentUser = await ctx.runQuery(internal.users.getCurrentUser);

    const group = await ctx.db.get(groupId);
    if (!group) throw new Error("Group not found");

    const isMember = group.members.some(
      (m) => m.userId === currentUser._id
    );
    if (!isMember) throw new Error("You are not a member of this group");

    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();

    const settlements = await ctx.db
      .query("settlements")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();

    return {
      group,
      expenses,
      settlements,
    };
  },
});


// ---------------------------------------------
// GET GROUP OR MEMBERS (your other missing function)
// ---------------------------------------------
// BEFORE (problem — required groupId)
// export const getGroupOrMembers = query({
//   args: v.object({ groupId: v.id("groups") }),
//   handler: async (ctx, args) => { ... }
// });

// AFTER — make groupId optional:
export const getGroupOrMembers = query({
  args: {
    groupId: v.optional(v.id("groups")), // optional groupId
  },
  handler: async (ctx, args) => {
    // if args.groupId is provided -> return selected group details
    // if not provided -> return list of groups
    const currentUser = await ctx.runQuery(internal.users.getCurrentUser);
  }
});