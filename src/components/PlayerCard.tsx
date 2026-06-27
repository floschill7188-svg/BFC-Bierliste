import React from 'react';
import { Player, Drink, Fine } from '../types';
import { User, Beer, AlertTriangle, ShieldCheck, Plus, Euro } from 'lucide-react';

interface PlayerCardProps {
  key?: React.Key;
  player: Player;
  drinks: Drink[];
  fines: Fine[];
  onAddDrink: (playerId: string, drinkId: string) => void;
  onAddFine: (playerId: string, fineId: string) => void;
  onOpenDetails: (player: Player) => void;
}

export default function PlayerCard({
  player,
  drinks,
  fines,
  onAddDrink,
  onAddFine,
  onOpenDetails,
}: PlayerCardProps) {
  // Calculate total costs
  const totalDrinksCost = Object.entries(player.drinksCount).reduce((acc, [drinkId, qty]) => {
    const drink = drinks.find((d) => d.id === drinkId);
    return acc + (drink ? drink.price * qty : 0);
  }, 0);

  const totalFinesCost = Object.entries(player.finesCount).reduce((acc, [fineId, qty]) => {
    const fine = fines.find((f) => f.id === fineId);
    return acc + (fine ? fine.amount * qty : 0);
  }, 0);

  const totalCost = totalDrinksCost + totalFinesCost;
  const balance = totalCost - player.totalPaid;

  const totalDrinksQty = Object.values(player.drinksCount).reduce((a, b) => a + b, 0);
  const totalFinesQty = Object.values(player.finesCount).reduce((a, b) => a + b, 0);

  // Determine status color/styling
  let balanceBg = 'bg-white border-slate-200 hover:bg-slate-50/80';
  let balanceText = 'text-slate-600';
  let balanceBadge = 'bg-slate-100 text-slate-600 border border-slate-200';

  if (balance >= 17) {
    balanceBg = 'bg-rose-50 border-rose-200 hover:bg-rose-100/60 shadow-sm';
    balanceText = 'text-rose-700';
    balanceBadge = 'bg-rose-100 text-rose-800 border border-rose-200';
  } else if (balance > 0) {
    balanceBg = 'bg-amber-50 border-amber-200 hover:bg-amber-100/60 shadow-sm';
    balanceText = 'text-amber-800';
    balanceBadge = 'bg-amber-100 text-amber-800 border border-amber-200';
  } else if (balance < 0) {
    balanceBg = 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100/60 shadow-sm';
    balanceText = 'text-emerald-700';
    balanceBadge = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  } else {
    balanceBg = 'bg-white border-slate-200/80 hover:bg-slate-50/80 shadow-sm';
    balanceText = 'text-slate-500';
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
      <div className="flex justify-between items-start mb-3">
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

        <div className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${balanceBadge}`}>
          {balance === 0 ? 'Ausgeglichen' : `${balance > 0 ? '+' : ''}${balance.toFixed(2)} €`}
        </div>
      </div>

      {/* Middle row: Stats counters */}
      <div className="grid grid-cols-2 gap-2 mb-4 bg-slate-50/80 p-2 rounded-xl border border-slate-200/60 text-xs font-mono">
        <div className="flex items-center gap-1.5 text-slate-600">
          <Beer className="w-3.5 h-3.5 text-[#FF6B00] shrink-0" />
          <span>Getränke:</span>
          <span className="font-bold text-slate-900 ml-auto">{totalDrinksQty}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-600">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>Strafen:</span>
          <span className="font-bold text-slate-900 ml-auto">{totalFinesQty}</span>
        </div>
      </div>

      {/* Bottom row: Quick action buttons */}
      <div
        className="flex items-center gap-1.5 pt-2 mt-auto border-t border-slate-100"
        onClick={(e) => e.stopPropagation()} // Prevent opening details modal when quick booking is clicked
      >
        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Quick:</span>

        {popularDrinks.map((drink) => (
          <button
            key={drink.id}
            onClick={() => onAddDrink(player.id, drink.id)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-white hover:bg-[#FF6B00] hover:text-white hover:border-[#FF6B00] border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 transition-all shadow-xs"
            title={`${drink.name} buchen (${drink.price.toFixed(2)} €)`}
            id={`quick-drink-${player.id}-${drink.id}`}
          >
            <Plus className="w-3 h-3 text-[#FF6B00] group-hover:text-white" />
            <span className="truncate">{drink.name.split(' ')[0]}</span>
          </button>
        ))}

        {fines.length > 0 && (
          <button
            onClick={() => onAddFine(player.id, fines[0].id)}
            className="flex items-center justify-center p-1.5 bg-white hover:bg-amber-600/10 hover:text-amber-600 hover:border-amber-400 border border-slate-200 rounded-lg transition-all shadow-xs"
            title={`Strafe buchen: ${fines[0].name} (${fines[0].amount.toFixed(2)} €)`}
            id={`quick-fine-${player.id}`}
          >
            <Plus className="w-3 h-3 text-amber-500" />
          </button>
        )}
      </div>
    </div>
  );
}
