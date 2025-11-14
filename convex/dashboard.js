// convex/dashboard.js
import { query } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * NOTE: This file is defensive — it returns safe defaults and never throws.
 * This prevents client-side crashes when production DB is missing documents or indexes.
 */

// Helper: safe getCurrentUser wrapper
async function safeGetCurrentUser(ctx) {
  try {
    const user = await ctx.runQuery(internal.users.getCurrentUser);
    return user ?? null;
  } catch (err) {
    return null;
  }
}

// Get user balances (1-to-1 + group balances)
export const getUserBalances = query({
  handler: async (ctx) => {
    try {
      const user = await safeGetCurrentUser(ctx);
      if (!user) {
        // Not authenticated — return safe empty result
        return {
          youOwe: 0,
          youAreOwed: 0,
          totalBalance: 0,
          oweDetails: { youOwe: [], youAreOwedBy: [] },
        };
      }

      // -----------------------
      // 1-to-1 expenses (no groupId)
      // -----------------------
      // Use index by_user_and_group if available (paidByUserId + groupId)
      // We'll query for expenses where paidByUserId === user._id and groupId === undefined
      let personalExpensesPaidByUser = [];
      try {
        personalExpensesPaidByUser = await ctx.db
          .query("expenses")
          .withIndex("by_user_and_group", (q) =>
            q.eq("paidByUserId", user._id).eq("groupId", undefined)
          )
          .collect();
      } catch (err) {
        // fallback: if index isn't present, collect all and filter
        const allExpenses = await ctx.db.query("expenses").collect();
        personalExpensesPaidByUser = allExpenses.filter(
          (e) => !e.groupId && e.paidByUserId === user._id
        );
      }

      // Also need personal expenses where someone else paid but current user is in splits
      let personalExpensesNotPaidByUser = [];
      try {
        // query groupId === undefined (1-to-1) then filter by split
        const maybe = await ctx.db
          .query("expenses")
          .withIndex("by_group", (q) => q.eq("groupId", undefined))
          .collect();
        personalExpensesNotPaidByUser = maybe.filter(
          (e) =>
            e.paidByUserId !== user._id &&
            e.splits?.some((s) => s.userId === user._id)
        );
      } catch (err) {
        // fallback: filter whole table
        const allExpenses = await ctx.db.query("expenses").collect();
        personalExpensesNotPaidByUser = allExpenses.filter(
          (e) =>
            !e.groupId &&
            e.paidByUserId !== user._id &&
            e.splits?.some((s) => s.userId === user._id)
        );
      }

      const expenses = [...personalExpensesPaidByUser, ...personalExpensesNotPaidByUser];

      // tallies
      let youOwe = 0;
      let youAreOwed = 0;
      const balanceByUser = {}; // userId -> { owed, owing }

      for (const e of expenses) {
        const isPayer = e.paidByUserId === user._id;
        const mySplit = e.splits?.find((s) => s.userId === user._id);

        if (isPayer) {
          // I paid — others owe me
          for (const s of e.splits || []) {
            if (s.userId === user._id || s.paid) continue;
            youAreOwed += s.amount;
            (balanceByUser[s.userId] ??= { owed: 0, owing: 0 }).owed += s.amount;
          }
        } else if (mySplit && !mySplit.paid) {
          // I owe someone else
          youOwe += mySplit.amount;
          (balanceByUser[e.paidByUserId] ??= { owed: 0, owing: 0 }).owing += mySplit.amount;
        }
      }

      // -----------------------
      // 1-to-1 settlements
      // -----------------------
      let personalSettlements = [];
      try {
        personalSettlements = await ctx.db.query("settlements").collect();
        personalSettlements = personalSettlements.filter(
          (s) =>
            !s.groupId &&
            (s.paidByUserId === user._id || s.receivedByUserId === user._id)
        );
      } catch (err) {
        // if collect fails, ensure empty
        personalSettlements = [];
      }

      for (const s of personalSettlements) {
        if (s.paidByUserId === user._id) {
          youOwe -= s.amount;
          (balanceByUser[s.receivedByUserId] ??= { owed: 0, owing: 0 }).owing -= s.amount;
        } else {
          youAreOwed -= s.amount;
          (balanceByUser[s.paidByUserId] ??= { owed: 0, owing: 0 }).owed -= s.amount;
        }
      }

      // Build lists
      const youOweList = [];
      const youAreOwedByList = [];
      for (const [uid, { owed = 0, owing = 0 }] of Object.entries(balanceByUser)) {
        const net = owed - owing;
        if (net === 0) continue;
        const counterpart = await ctx.db.get(uid).catch(() => null);
        const base = {
          userId: uid,
          name: counterpart?.name ?? "Unknown",
          imageUrl: counterpart?.imageUrl ?? null,
          amount: Math.abs(net),
        };
        if (net > 0) youAreOwedByList.push(base);
        else youOweList.push(base);
      }

      youOweList.sort((a, b) => b.amount - a.amount);
      youAreOwedByList.sort((a, b) => b.amount - a.amount);

      return {
        youOwe,
        youAreOwed,
        totalBalance: youAreOwed - youOwe,
        oweDetails: { youOwe: youOweList, youAreOwedBy: youAreOwedByList },
      };
    } catch (err) {
      // On any unexpected error return safe defaults (prevents client crash)
      console.error("getUserBalances error:", err);
      return {
        youOwe: 0,
        youAreOwed: 0,
        totalBalance: 0,
        oweDetails: { youOwe: [], youAreOwedBy: [] },
      };
    }
  },
});

// Get total spent in the current year
export const getTotalSpent = query({
  handler: async (ctx) => {
    try {
      const user = await safeGetCurrentUser(ctx);
      if (!user) return 0;

      const currentYear = new Date().getFullYear();
      const startOfYear = new Date(currentYear, 0, 1).getTime();

      // Use index by_date if available
      let expenses = [];
      try {
        expenses = await ctx.db
          .query("expenses")
          .withIndex("by_date", (q) => q.gte("date", startOfYear))
          .collect();
      } catch {
        expenses = await ctx.db.query("expenses").collect();
      }

      const userExpenses = expenses.filter(
        (expense) =>
          expense.paidByUserId === user._id ||
          (expense.splits || []).some((split) => split.userId === user._id)
      );

      let totalSpent = 0;
      for (const expense of userExpenses) {
        const userSplit = (expense.splits || []).find((split) => split.userId === user._id);
        if (userSplit) totalSpent += userSplit.amount;
      }

      return totalSpent;
    } catch (err) {
      console.error("getTotalSpent error:", err);
      return 0;
    }
  },
});

// Get monthly spending (current year)
export const getMonthlySpending = query({
  handler: async (ctx) => {
    try {
      const user = await safeGetCurrentUser(ctx);
      if (!user) return [];

      const currentYear = new Date().getFullYear();
      const startOfYear = new Date(currentYear, 0, 1).getTime();

      let allExpenses = [];
      try {
        allExpenses = await ctx.db
          .query("expenses")
          .withIndex("by_date", (q) => q.gte("date", startOfYear))
          .collect();
      } catch {
        allExpenses = await ctx.db.query("expenses").collect();
      }

      const userExpenses = allExpenses.filter(
        (expense) =>
          expense.paidByUserId === user._id ||
          (expense.splits || []).some((split) => split.userId === user._id)
      );

      const monthlyTotals = {};
      for (let i = 0; i < 12; i++) {
        const monthDate = new Date(currentYear, i, 1).getTime();
        monthlyTotals[monthDate] = 0;
      }

      for (const expense of userExpenses) {
        const date = new Date(expense.date);
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
        const userSplit = (expense.splits || []).find((split) => split.userId === user._id);
        if (userSplit) {
          monthlyTotals[monthStart] = (monthlyTotals[monthStart] || 0) + userSplit.amount;
        }
      }

      const result = Object.entries(monthlyTotals).map(([month, total]) => ({
        month: parseInt(month, 10),
        total,
      })).sort((a, b) => a.month - b.month);

      return result;
    } catch (err) {
      console.error("getMonthlySpending error:", err);
      return [];
    }
  },
});

// Get groups for the current user
export const getUserGroups = query({
  handler: async (ctx) => {
    try {
      const user = await safeGetCurrentUser(ctx);
      if (!user) return [];

      // Fetch all groups and filter for membership
      let allGroups = [];
      try {
        allGroups = await ctx.db.query("groups").collect();
      } catch {
        allGroups = [];
      }

      const groups = (allGroups || []).filter((g) => (g.members || []).some((m) => m.userId === user._id));

      const enhancedGroups = await Promise.all(
        groups.map(async (group) => {
          // Get group expenses using index
          let expenses = [];
          try {
            expenses = await ctx.db
              .query("expenses")
              .withIndex("by_group", (q) => q.eq("groupId", group._id))
              .collect();
          } catch {
            // fallback: filter all expenses
            const allExpenses = await ctx.db.query("expenses").collect();
            expenses = allExpenses.filter((e) => e.groupId === group._id);
          }

          let balance = 0;
          for (const expense of expenses) {
            if (expense.paidByUserId === user._id) {
              for (const split of expense.splits || []) {
                if (split.userId !== user._id && !split.paid) {
                  balance += split.amount;
                }
              }
            } else {
              const userSplit = (expense.splits || []).find((s) => s.userId === user._id);
              if (userSplit && !userSplit.paid) {
                balance -= userSplit.amount;
              }
            }
          }

          // settlements for group
          let settlements = [];
          try {
            settlements = await ctx.db
              .query("settlements")
              .filter((q) =>
                q.and(
                  q.eq(q.field("groupId"), group._id),
                  q.or(
                    q.eq(q.field("paidByUserId"), user._id),
                    q.eq(q.field("receivedByUserId"), user._id)
                  )
                )
              )
              .collect();
          } catch {
            settlements = [];
          }

          for (const s of settlements) {
            if (s.paidByUserId === user._id) {
              balance += s.amount;
            } else {
              balance -= s.amount;
            }
          }

          return {
            ...group,
            id: group._id,
            balance,
          };
        })
      );

      return enhancedGroups;
    } catch (err) {
      console.error("getUserGroups error:", err);
      return [];
    }
  },
});