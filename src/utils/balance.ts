import { Player, Drink, Fine, Team, Transaction, Expense } from '../types';

export interface CalculatedPlayerTeamBalance {
  drinksCost: number;
  finesCost: number;
  totalCost: number;
  paid: number;
  balance: number; // positive = owes money, negative = credit
  drinksQty: number;
  finesQty: number;
  points: number;
}

export function getPlayerTeamBalance(
  player: Player,
  drinks: Drink[],
  fines: Fine[],
  teamKey: Team
): CalculatedPlayerTeamBalance {
  const teamStat = player.teamStats?.[teamKey];
  const isMember = player.teams?.includes(teamKey) || player.team === teamKey;

  const dCount = teamStat?.drinksCount || {};
  const fCount = teamStat?.finesCount || {};
  const paid = Number(teamStat?.totalPaid || 0);

  const drinksCost = Object.entries(dCount).reduce((acc, [drinkId, qty]) => {
    const drink = drinks.find((d) => d.id === drinkId);
    return acc + (drink ? drink.price * Number(qty) : 0);
  }, 0);

  const finesCost = Object.entries(fCount).reduce((acc, [fineId, qty]) => {
    const fine = fines.find((f) => f.id === fineId);
    return acc + (fine ? fine.amount * Number(qty) : 0);
  }, 0);

  const drinksQty = Object.values(dCount).reduce((a, b) => a + Number(b), 0);
  const finesQty = Object.values(fCount).reduce((a, b) => a + Number(b), 0);
  const points = Object.entries(fCount).reduce((acc, [fineId, qty]) => {
    const fine = fines.find((f) => f.id === fineId);
    return acc + (fine && fine.points ? fine.points * Number(qty) : 0);
  }, 0);

  const totalCost = drinksCost + finesCost;
  const balance = Number((totalCost - paid).toFixed(2));

  return {
    drinksCost,
    finesCost,
    totalCost,
    paid,
    balance: isMember || balance !== 0 ? balance : 0,
    drinksQty,
    finesQty,
    points
  };
}

export interface TeamCashBoxStats {
  totalPaid: number;
  totalExpenses: number;
  cashBalance: number;
  totalDebt: number; // sum of positive balances
  drinksCount: number;
  finesCount: number;
  revenue: number;
}

export function calculateCashBoxStats(
  teamKey: Team,
  players: Player[],
  drinks: Drink[],
  fines: Fine[],
  expenses: Expense[]
): TeamCashBoxStats {
  let totalPaid = 0;
  let totalDebt = 0;
  let drinksCount = 0;
  let finesCount = 0;
  let revenue = 0;

  players.forEach((p) => {
    const stat = getPlayerTeamBalance(p, drinks, fines, teamKey);
    totalPaid += stat.paid;
    if (stat.balance > 0) {
      totalDebt += stat.balance;
    }
    drinksCount += stat.drinksQty;
    finesCount += stat.finesQty;
    revenue += stat.totalCost;
  });

  const teamExpenses = expenses
    .filter((e) => (e.team || 'Herren 1') === teamKey)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const cashBalance = Number((totalPaid - teamExpenses).toFixed(2));

  return {
    totalPaid: Number(totalPaid.toFixed(2)),
    totalExpenses: Number(teamExpenses.toFixed(2)),
    cashBalance,
    totalDebt: Number(totalDebt.toFixed(2)),
    drinksCount,
    finesCount,
    revenue: Number(revenue.toFixed(2))
  };
}
