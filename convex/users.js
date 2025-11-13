import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Store user after Clerk login
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (existing) return existing._id;

    return await ctx.db.insert("users", {
      name: identity.name ?? "User",
      email: identity.email,
      tokenIdentifier: identity.tokenIdentifier,
      imageUrl: identity.pictureUrl,
    });
  },
});

// Get logged-in user
export const getCurrentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
  },
});

// Search users (supports virtual emails)
export const searchUsers = query({
  args: { query: v.string() },
  handler: async (ctx, { query: q }) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return [];

    // Email pattern
    if (trimmed.includes("@")) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (qq) => qq.eq("email", trimmed))
        .unique();

      if (existing) {
        return [
          {
            id: existing._id,
            name: existing.name,
            email: existing.email,
            imageUrl: existing.imageUrl,
          },
        ];
      }

      // Virtual user
      return [
        {
          id: null,
          name: trimmed.split("@")[0],
          email: trimmed,
          imageUrl: null,
        },
      ];
    }

    // Name search
    const results = await ctx.db
      .query("users")
      .withSearchIndex("search_name", (qq) => qq.search("name", trimmed))
      .collect();

    return results.map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      imageUrl: u.imageUrl,
    }));
  },
});