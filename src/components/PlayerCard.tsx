import React from 'react';
import { Player, Drink, Fine, Team } from '../types';
import { User, Beer, AlertTriangle, ShieldCheck, Plus, Euro, Lock } from 'lucide-react';

interface PlayerCardProps {
  key?: React.Key;
  player: Player;
  drinks: Drink[];
  fines: Fine[];
  selectedTeam?: 'All' | 'Herren 1' | 'Herren 2';
  onAddDrink: (playerId: string, drinkId: string, team?: Team) => void;
  onAddFine: (playerId: string, fineId: string, team?: Team) => void;
  onOpenDetails: (player: Player) => void;
  isAuthorized: boolean;
  isAdminMode: boolean;
}

export default function PlayerCard({
  player,
  drinks,
  fines,
  selectedTeam = 'All',
  onAddDrink,
  onAddFine,
  onOpenDetails,
  isAuthorized,
  isAdminMode,
}: PlayerCardProps) {
  const isMultiTeam = (player.teams && player.teams.length > 1) || (player.teams?.includes('Herren 1') && player.teams?.includes('Herren 2'));

  const getStatsForTeam = (teamKey?: 'Herren 1' | 'Herren 2') => {
    let dCount = player.drinksCount || {};
    let fCount = player.finesCount || {};
    let paid = Number(player.totalPaid || 0);

    if (teamKey && player.teamStats && player.teamStats[teamKey]) {
      dCount = player.teamStats[teamKey]?.drinksCount || {};
      fCount = player.teamStats[teamKey]?.finesCount || {};
      paid = Number(player.teamStats[teamKey]?.totalPaid || 0);
    } else if (teamKey && !player.teams?.includes(teamKey)) {
      dCount = {};
      fCount = {};
      paid = 0;
    }

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
      balance,
      drinksQty,
      finesQty,
      points
    };
  };

  const h1Stats = getStatsForTeam('Herren 1');
  const h2Stats = getStatsForTeam('Herren 2');

  const activeStats = selectedTeam === 'Herren 1' 
    ? h1Stats 
    : selectedTeam === 'Herren 2' 
    ? h2Stats 
    : isMultiTeam 
    ? h1Stats 
    : (player.teams?.includes('Herren 2') ? h2Stats : h1Stats);

  const balance = activeStats.balance;
  const totalDrinksQty = selectedTeam === 'All' && isMultiTeam 
    ? h1Stats.drinksQty + h2Stats.drinksQty 
    : activeStats.drinksQty;
  const totalFinesQty = selectedTeam === 'All' && isMultiTeam 
    ? h1Stats.finesQty + h2Stats.finesQty 
    : activeStats.finesQty;
  const totalPoints = selectedTeam === 'All' && isMultiTeam 
    ? h1Stats.points + h2Stats.points 
    : activeStats.points;

  // Determine status color/styling
  let balanceBg = 'bg-white border-slate-200 hover:bg-slate-50/80';
  let balanceBadge = 'bg-slate-100 text-slate-600 border border-slate-200';

  const maxBalance = selectedTeam === 'All' && isMultiTeam 
    ? Math.max(h1Stats.balance, h2Stats.balance) 
    : balance;

  if (maxBalance >= 17) {
    balanceBg = 'bg-rose-50 border-rose-200 hover:bg-rose-100/60 shadow-sm';
    balanceBadge = 'bg-rose-100 text-rose-800 border border-rose-200';
  } else if (maxBalance > 0) {
    balanceBg = 'bg-amber-50 border-amber-200 hover:bg-amber-100/60 shadow-sm';
    balanceBadge = 'bg-amber-100 text-amber-800 border border-amber-200';
  } else if (maxBalance < 0) {
    balanceBg = 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100/60 shadow-sm';
    balanceBadge = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  } else {
    balanceBg = 'bg-white border-slate-200/80 hover:bg-slate-50/80 shadow-sm';
    balanceBadge = 'bg-slate-100 text-slate-600 border border-slate-200';
  }

  // Get top 2 popular drinks for quick recording
  const popularDrinks = drinks.filter((d) => d.isActive).slice(0, 2);

  return (
    <div
      className={`relative flex flex-col justify-between p-4 rounded-2xl border transition-all duration-250 cursor-pointer ${balanceBg}`}
      id={`player-card-${player.id}`}
      onClick={() => onOpenDetails(player)}
    >
      {/* Top row: Name & Jersey # */}
      <div className="flex justify-between items-start mb-3 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm shrink-0">
            {player.number ? (
              <span className="font-mono text-[#FF6B00] font-black">#{player.number}</span>
            ) : (
              <User className="w-5 h-5 text-slate-500" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-slate-900 truncate">{player.name}</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              BFC Freiburg • {player.teams && player.teams.length > 0 ? player.teams.join(' & ') : (player.team || 'Herren 1')}
            </p>
          </div>
        </div>

        {/* Separate Badges for Multi-Team or Single Badge */}
        {selectedTeam === 'All' && isMultiTeam ? (
          <div className="flex flex-col items-end gap-1 shrink-0 font-mono text-[11px] font-bold">
            <div className={`px-2 py-0.5 rounded-md border flex items-center gap-1 ${
              h1Stats.balance > 0 ? 'bg-amber-100/80 text-amber-900 border-amber-200' : h1Stats.balance < 0 ? 'bg-emerald-100/80 text-emerald-900 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}>
              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-sans font-extrabold">H1:</span>
              <span>{h1Stats.balance === 0 ? '0,00 €' : h1Stats.balance < 0 ? `-${Math.abs(h1Stats.balance).toFixed(2)} €` : `+${h1Stats.balance.toFixed(2)} €`}</span>
            </div>
            <div className={`px-2 py-0.5 rounded-md border flex items-center gap-1 ${
              h2Stats.balance > 0 ? 'bg-amber-100/80 text-amber-900 border-amber-200' : h2Stats.balance < 0 ? 'bg-emerald-100/80 text-emerald-900 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}>
              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-sans font-extrabold">H2:</span>
              <span>{h2Stats.balance === 0 ? '0,00 €' : h2Stats.balance < 0 ? `-${Math.abs(h2Stats.balance).toFixed(2)} €` : `+${h2Stats.balance.toFixed(2)} €`}</span>
            </div>
          </div>
        ) : (
          <div className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold shrink-0 ${balanceBadge}`}>
            {selectedTeam !== 'All' && (
              <span className="text-[9px] uppercase font-sans font-extrabold mr-1 opacity-70">
                {selectedTeam === 'Herren 1' ? 'H1' : 'H2'}:
              </span>
            )}
            {balance === 0 ? 'Ausgeglichen' : balance < 0 ? `Guthaben: ${Math.abs(balance).toFixed(2)} €` : `+${balance.toFixed(2)} €`}
          </div>
        )}
      </div>

      {/* Middle row: Stats counters */}
      <div className="flex flex-col gap-1.5 mb-4 bg-slate-50/80 p-2 rounded-xl border border-slate-200/60 text-xs font-mono">
        <div className="grid grid-cols-3 gap-1">
          <div className="flex items-center gap-1 text-slate-600 min-w-0">
            <Beer className="w-3.5 h-3.5 text-[#FF6B00] shrink-0" />
            <span className="truncate">Getränke:</span>
            <span className="font-bold text-slate-900 ml-auto">{totalDrinksQty}</span>
          </div>
          <div className="flex items-center gap-1 text-slate-600 min-w-0 border-l border-slate-200/60 pl-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">Strafen:</span>
            <span className="font-bold text-slate-900 ml-auto">{totalFinesQty}</span>
          </div>
          <div className="flex items-center gap-1 text-slate-600 min-w-0 border-l border-slate-200/60 pl-1.5" title="Strafpunkte">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="truncate">Punkte:</span>
            <span className="font-bold text-amber-600 ml-auto">{totalPoints}</span>
          </div>
        </div>
        {totalPoints >= 3 && (
          <div className="text-[10px] text-amber-800 bg-amber-100/60 border border-amber-200 px-1.5 py-0.5 rounded-md flex items-center justify-between font-sans">
            <span className="font-bold">⚠️ Zusatz-Dienste fällig:</span>
            <span className="font-mono font-black text-rose-700 bg-white px-1.5 py-0.5 rounded border border-amber-200">{Math.floor(totalPoints / 3)} fällig</span>
          </div>
        )}
      </div>

      {/* Bottom row: Quick action buttons */}
      <div
        className="flex items-center gap-1.5 pt-2 mt-auto border-t border-slate-100"
        onClick={(e) => e.stopPropagation()} // Prevent opening details modal when quick booking is clicked
      >
        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
          {(isAuthorized || isAdminMode) ? 'Quick:' : '🔒 Lock:'}
        </span>

        {popularDrinks.map((drink) => {
          const targetTeam = selectedTeam !== 'All' ? selectedTeam : (isMultiTeam ? undefined : (player.teams?.[0] || player.team || 'Herren 1'));
          return (
            <button
              key={drink.id}
              onClick={() => onAddDrink(player.id, drink.id, targetTeam)}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-white hover:bg-[#FF6B00] hover:text-white hover:border-[#FF6B00] border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 transition-all shadow-xs cursor-pointer"
              title={isAuthorized ? `${drink.name} buchen (${drink.price.toFixed(2)} €)${isMultiTeam && selectedTeam === 'All' ? ' - Team wird abgefragt' : ''}` : `${drink.name} (Freigabe erforderlich)`}
              id={`quick-drink-${player.id}-${drink.id}`}
            >
              {isAuthorized ? (
                <Plus className="w-3 h-3 text-[#FF6B00] group-hover:text-white" />
              ) : (
                <Lock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
              )}
              <span className="truncate">{drink.name.split(' ')[0]}</span>
            </button>
          );
        })}

        {fines.length > 0 && (() => {
          const targetTeam = selectedTeam !== 'All' ? selectedTeam : (isMultiTeam ? undefined : (player.teams?.[0] || player.team || 'Herren 1'));
          return (
            <button
              onClick={() => onAddFine(player.id, fines[0].id, targetTeam)}
              className="flex items-center justify-center p-1.5 bg-white hover:bg-amber-600/10 hover:text-amber-600 hover:border-amber-400 border border-slate-200 rounded-lg transition-all shadow-xs cursor-pointer"
              title={isAdminMode ? `Strafe buchen: ${fines[0].name} (${fines[0].amount.toFixed(2)} €)${isMultiTeam && selectedTeam === 'All' ? ' - Team wird abgefragt' : ''}` : `Strafe buchen (Trainer-Freigabe erforderlich)`}
              id={`quick-fine-${player.id}`}
            >
              {isAdminMode ? (
                <Plus className="w-3 h-3 text-amber-500" />
              ) : (
                <Lock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
              )}
            </button>
          );
        })()}
      </div>
    </div>
  );
}
