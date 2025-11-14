// convex/users.js
import { internalQuery, internalMutation, query } from "./_generated/server";

/* ----------------------------------------------------------
   INTERNAL: Fetch current Clerk-authenticated user
----------------------------------------------------------- */
export const getCurrentUser = internalQuery({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) return null; // Not logged in

    const clerkId = identity.subject;

    // Look up user by clerkId
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    return user ?? null;
  },
});

/* ----------------------------------------------------------
   PUBLIC: Return current user safely (never throws)
----------------------------------------------------------- */
export const currentUser = query({
  handler: async (ctx) => {
    try {
      const user = await ctx.runQuery(internal.users.getCurrentUser);
      return user ?? null;
    } catch {
      return null;
    }
  },
});

/* ----------------------------------------------------------
   INTERNAL: Create user if first login
----------------------------------------------------------- */
export const createUserIfMissing = internalMutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null; // unauthenticated user

    const clerkId = identity.subject;
    const email = identity.email ?? "";
    const name = identity.name ?? identity.firstName ?? "User";
    const imageUrl = identity.pictureUrl ?? null;

    // Check if user exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (existing) {
      // Optional: keep profile updated
      await ctx.db.patch(existing._id, {
        name,
        email,
        imageUrl,
      });
      return existing._id;
    }

    // Create new Convex user
    const userId = await ctx.db.insert("users", {
      clerkId,
      name,
      email,
      imageUrl,
    });

    return userId;
  },
});

/* ----------------------------------------------------------
   PUBLIC: Ensure user exists (called on auth)
----------------------------------------------------------- */
export const ensureUser = query({
  handler: async (ctx) => {
    try {
      const userId = await ctx.runMutation(
        internal.users.createUserIfMissing
      );
      return userId ?? null;
    } catch {
      return null;
    }
  },
});