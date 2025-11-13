// convex/contacts.js
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/* ------------------------------------------------------------------
   1. getAllContacts – shows personal 1-to-1 contacts + groups
------------------------------------------------------------------- */
export const getAllContacts = query({
  handler: async (ctx) => {
    const currentUser = await ctx.runQuery(internal.users.getCurrentUser);

    // PERSONAL EXPENSES YOU PAID
    const expensesYouPaid = await ctx.db
      .query("expenses")
      .withIndex("by_user_and_group", (q) =>
        q.eq("paidByUserId", currentUser._id).eq("groupId", null)
      )
      .collect();

    // PERSONAL EXPENSES YOU DID NOT PAY
    const expensesNotPaidByYou = await ctx.db
      .query("expenses")
      .withIndex("by_group", (q) => q.eq("groupId", null))
      .collect();

    const personalExpenses = expensesNotPaidByYou.filter(
      (e) =>
        e.paidByUserId !== currentUser._id &&
        e.splits.some((s) => s.userId === currentUser._id)
    );

    const all = [...expensesYouPaid, ...personalExpenses];

    // Unique counterpart IDs
    const contactIds = new Set();
    all.forEach((exp) => {
      if (exp.paidByUserId !== currentUser._id)
        contactIds.add(exp.paidByUserId);

      exp.splits.forEach((s) => {
        if (s.userId !== currentUser._id) contactIds.add(s.userId);
      });
    });

    // Fetch users
    const contactUsers = await Promise.all(
      [...contactIds].map(async (id) => {
        const u = await ctx.db.get(id);
        return u
          ? {
              id: u._id,
              name: u.name,
              email: u.email,
              imageUrl: u.imageUrl,
              type: "user",
            }
          : null;
      })
    );

    // Groups where you are a member
    const userGroups = (await ctx.db.query("groups").collect())
      .filter((g) => g.members.some((m) => m.userId === currentUser._id))
      .map((g) => ({
        id: g._id,
        name: g.name,
        description: g.description,
        memberCount: g.members.length,
        type: "group",
      }));

    return {
      users: contactUsers.filter(Boolean),
      groups: userGroups,
    };
  },
});

/* ------------------------------------------------------------------
   2. createGroup – NEW EMAIL-SUPPORTED FORMAT
------------------------------------------------------------------- */
export const createGroup = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    members: v.array(
      v.object({
        userId: v.optional(v.id("users")), // real users → Convex ID
        email: v.string(),                 // ALL members must have an email
        role: v.string(),
      })
    ),
  },

  handler: async (ctx, args) => {
    const currentUser = await ctx.runQuery(internal.users.getCurrentUser);

    const cleanName = args.name.trim();
    if (!cleanName) throw new Error("Group name cannot be empty");

    // Build final members array
    const finalMembers = [];

    // Add creator
    finalMembers.push({
      userId: currentUser._id,
      email: currentUser.email,
      role: "admin",
      joinedAt: Date.now(),
    });

    // Add provided members
    for (const m of args.members) {
      // Skip if trying to add yourself
      if (m.email === currentUser.email) continue;

      finalMembers.push({
        userId: m.userId ?? null, // null means not a Convex user yet
        email: m.email,
        role: m.role,
        joinedAt: Date.now(),
      });
    }

    // Insert group
    return await ctx.db.insert("groups", {
      name: cleanName,
      description: args.description?.trim() ?? "",
      createdBy: currentUser._id,
      members: finalMembers,
      createdAt: Date.now(),
    });
  },
});