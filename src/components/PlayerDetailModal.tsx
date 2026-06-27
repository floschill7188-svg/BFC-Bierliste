import React, { useState } from 'react';
import { Player, Drink, Fine, Transaction } from '../types';
import { X, Trash2, Plus, Minus, CreditCard, History, Edit2, Check, UserPlus, Save, AlertTriangle } from 'lucide-react';

interface PlayerDetailModalProps {
  player: Player | null;
  drinks: Drink[];
  fines: Fine[];
  transactions: Transaction[];
  onClose: () => void;
  onAddDrink: (playerId: string, drinkId: string) => void;
  onRemoveDrink: (playerId: string, drinkId: string) => void;
  onAddFine: (playerId: string, fineId: string) => void;
  onRemoveFine: (playerId: string, fineId: string) => void;
  onAddPayment: (playerId: string, amount: number) => void;
  onUpdatePlayer: (id: string, name: string, number?: string, teams?: ('Herren 1' | 'Herren 2')[]) => void;
  onDeletePlayer: (id: string) => void;
  isAdminMode: boolean;
  onTriggerAdminPrompt: (actionType: 'edit_player' | 'delete_player') => void;
}

export default function PlayerDetailModal({
  player,
  drinks,
  fines,
  transactions,
  onClose,
  onAddDrink,
  onRemoveDrink,
  onAddFine,
  onRemoveFine,
  onAddPayment,
  onUpdatePlayer,
  onDeletePlayer,
  isAdminMode,
  onTriggerAdminPrompt,
}: PlayerDetailModalProps) {
  if (!player) return null;

  const [activeSubTab, setActiveSubTab] = useState<'consume' | 'history' | 'edit'>('consume');

  // Settle state
  const [paymentAmount, setPaymentAmount] = useState('');

  // Edit player state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(player.name);
  const [editNumber, setEditNumber] = useState(player.number || '');
  const [editTeams, setEditTeams] = useState<('Herren 1' | 'Herren 2')[]>(player.teams || (player.team ? [player.team] : ['Herren 1']));
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Filter player-specific transactions
  const playerTransactions = transactions
    .filter((t) => t.playerId === player.id)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Calculate costs
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

  const handleSavePlayerInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    if (!isAdminMode) {
      onTriggerAdminPrompt('edit_player');
      return;
    }
    onUpdatePlayer(player.id, editName.trim(), editNumber.trim() || undefined, editTeams);
    setIsEditing(false);
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;
    onAddPayment(player.id, amount);
    setPaymentAmount('');
  };

  const handleSettleFull = () => {
    if (balance <= 0) return;
    onAddPayment(player.id, balance);
    setPaymentAmount('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" id="player-detail-modal">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-orange-50 border border-orange-200 text-[#FF6B00] flex items-center justify-center font-bold text-lg font-mono">
              {player.number ? `#${player.number}` : player.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              {isEditing ? (
                <form onSubmit={handleSavePlayerInfo} className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="bg-white border border-slate-200 text-xs rounded-lg px-2 py-1 text-slate-800 focus:outline-none focus:border-[#FF6B00]"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Nr"
                    value={editNumber}
                    onChange={(e) => setEditNumber(e.target.value)}
                    className="w-12 bg-white border border-slate-200 text-xs rounded-lg px-2 py-1 text-slate-800 text-center focus:outline-none focus:border-[#FF6B00]"
                  />
                  <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        if (editTeams.includes('Herren 1')) {
                          if (editTeams.length > 1) setEditTeams(editTeams.filter(t => t !== 'Herren 1'));
                        } else {
                          setEditTeams([...editTeams, 'Herren 1']);
                        }
                      }}
                      className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition ${
                        editTeams.includes('Herren 1')
                          ? 'bg-[#FF6B00] text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      H1
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (editTeams.includes('Herren 2')) {
                          if (editTeams.length > 1) setEditTeams(editTeams.filter(t => t !== 'Herren 2'));
                        } else {
                          setEditTeams([...editTeams, 'Herren 2']);
                        }
                      }}
                      className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition ${
                        editTeams.includes('Herren 2')
                          ? 'bg-[#FF6B00] text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      H2
                    </button>
                  </div>
                  <button type="submit" className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer">
                    <Check className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold text-slate-900">{player.name}</h2>
                  <button
                    onClick={() => {
                      if (isAdminMode) {
                        setIsEditing(true);
                      } else {
                        onTriggerAdminPrompt('edit_player');
                      }
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded transition cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <p className="text-xs text-slate-500">
                Mitglieder-Abrechnung • {player.teams && player.teams.length > 0 ? player.teams.join(' & ') : (player.team || 'Herren 1')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
            id="close-modal-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Cards Bar */}
        <div className="grid grid-cols-3 gap-2 px-6 py-4 bg-slate-50/50 border-b border-slate-100">
          <div className="p-3 bg-white rounded-xl border border-slate-100 text-center shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              {balance < 0 ? 'Guthaben' : 'Ausstehend'}
            </span>
            <p className={`text-lg font-black mt-0.5 font-mono ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {balance < 0 ? `${Math.abs(balance).toFixed(2)} €` : `${balance.toFixed(2)} €`}
            </p>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-100 text-center shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Berechnet</span>
            <p className="text-lg font-black text-slate-700 mt-0.5 font-mono">
              {totalCost.toFixed(2)} €
            </p>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-100 text-center shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Beglichen</span>
            <p className="text-lg font-black text-emerald-600 mt-0.5 font-mono">
              {player.totalPaid.toFixed(2)} €
            </p>
          </div>
        </div>

        {/* Modal Sub-tabs */}
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => setActiveSubTab('consume')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition border-b-2 cursor-pointer ${
              activeSubTab === 'consume'
                ? 'border-[#FF6B00] text-[#FF6B00] bg-orange-50/50'
                : 'border-transparent text-slate-400 hover:text-slate-800'
            }`}
          >
            ✍️ Buchen &amp; Begleichen
          </button>
          <button
            onClick={() => setActiveSubTab('history')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition border-b-2 cursor-pointer ${
              activeSubTab === 'history'
                ? 'border-[#FF6B00] text-[#FF6B00] bg-orange-50/50'
                : 'border-transparent text-slate-400 hover:text-slate-800'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              Historie ({playerTransactions.length})
            </span>
          </button>
          <button
            onClick={() => setActiveSubTab('edit')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition border-b-2 cursor-pointer ${
              activeSubTab === 'edit'
                ? 'border-[#FF6B00] text-[#FF6B00] bg-orange-50/50'
                : 'border-transparent text-slate-400 hover:text-slate-800'
            }`}
          >
            ⚙️ Spieler-Aktion
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* CONSUME TAB */}
          {activeSubTab === 'consume' && (
            <div className="space-y-6">
              {/* Quick Book Section */}
              <div>
                <h3 className="text-xs uppercase font-extrabold text-slate-500 tracking-wider mb-3">Getränkekonsum eintragen</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {drinks.filter((d) => d.isActive).map((drink) => {
                    const count = player.drinksCount[drink.id] || 0;
                    return (
                      <div
                        key={drink.id}
                        className="flex items-center justify-between p-3 bg-slate-50/50 border border-slate-100 rounded-xl"
                      >
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-slate-800 block truncate">{drink.name}</span>
                          <span className="text-xs text-[#FF6B00] font-mono font-bold">{drink.price.toFixed(2)} €</span>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => onRemoveDrink(player.id, drink.id)}
                            disabled={count === 0}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              count > 0
                                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                            }`}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-mono font-bold text-sm text-slate-800 w-6 text-center">{count}</span>
                          <button
                            onClick={() => onAddDrink(player.id, drink.id)}
                            className="p-1.5 bg-orange-50 hover:bg-[#FF6B00] border border-orange-200 hover:border-[#FF6B00] text-[#FF6B00] hover:text-white rounded-lg transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Strafen Section */}
              <div>
                <h3 className="text-xs uppercase font-extrabold text-slate-500 tracking-wider mb-3">Strafenkatalog anwenden</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {fines.filter((f) => f.isActive).map((fine) => {
                    const count = player.finesCount[fine.id] || 0;
                    return (
                      <div
                        key={fine.id}
                        className="flex items-center justify-between p-3 bg-slate-50/50 border border-slate-100 rounded-xl"
                      >
                        <div className="min-w-0 pr-2">
                          <span className="text-sm font-semibold text-slate-800 block truncate" title={fine.name}>
                            {fine.name}
                          </span>
                          <span className="text-xs text-amber-600 font-mono font-bold">{fine.amount.toFixed(2)} €</span>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <button
                            onClick={() => onRemoveFine(player.id, fine.id)}
                            disabled={count === 0}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              count > 0
                                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                            }`}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-mono font-bold text-sm text-slate-800 w-6 text-center">{count}</span>
                          <button
                            onClick={() => onAddFine(player.id, fine.id)}
                            className="p-1.5 bg-amber-50 hover:bg-amber-500 border border-amber-200 hover:border-amber-500 text-amber-600 hover:text-white rounded-lg transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PAYMENT SECTION (Settle Debt) */}
              <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-2">
                  <CreditCard className="text-emerald-600 w-4 h-4" />
                  Guthaben einzahlen / Begleichen
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Trage bar bezahltes Geld ein, um den Kontostand auszugleichen.
                </p>

                <form onSubmit={handlePaymentSubmit} className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Betrag in €"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-mono shadow-2xs"
                    />
                    <span className="absolute left-3 top-2 text-slate-400 font-mono text-sm">€</span>
                  </div>

                  <button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-4 py-2 rounded-lg transition active:scale-95 shrink-0 cursor-pointer"
                  >
                    Einzahlen
                  </button>

                  {balance > 0 && (
                    <button
                      type="button"
                      onClick={handleSettleFull}
                      className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-sm px-4 py-2 rounded-lg transition shrink-0 cursor-pointer shadow-2xs"
                    >
                      Alles ({balance.toFixed(2)} €) begleichen
                    </button>
                  )}
                </form>
              </div>
            </div>
          )}

          {/* HISTORY TAB */}
          {activeSubTab === 'history' && (
            <div className="space-y-3">
              <h3 className="text-xs uppercase font-extrabold text-slate-500 tracking-wider">Buchungsverlauf von {player.name}</h3>
              {playerTransactions.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 border border-slate-150 rounded-2xl text-slate-400 text-sm">
                  Keine Transaktionen für diesen Spieler gefunden.
                </div>
              ) : (
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {playerTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex justify-between items-center p-3 bg-slate-50/50 border border-slate-100 rounded-xl"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              tx.type === 'drink'
                                ? 'bg-orange-500'
                                : tx.type === 'fine'
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                          />
                          <span className="text-sm font-bold text-slate-800">
                            {tx.type === 'drink' ? '🍺 ' : tx.type === 'fine' ? '📜 ' : '💵 '}
                            {tx.itemName}
                          </span>
                          {tx.quantity > 1 && (
                            <span className="text-xs bg-slate-100 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                              {tx.quantity}x
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 block font-mono mt-1">
                          {new Date(tx.timestamp).toLocaleString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <div className="text-right">
                        <span
                          className={`font-mono font-bold text-sm ${
                            tx.type === 'payment' ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {tx.type === 'payment' ? '-' : '+'}{(tx.amount * tx.quantity).toFixed(2)} €
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ACTION/EDIT TAB */}
          {activeSubTab === 'edit' && (
            <div className="space-y-6">
              {/* Delete Player Section */}
              <div className="p-4 border border-rose-200 bg-rose-50 rounded-2xl">
                <h4 className="text-sm font-bold text-rose-700 flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  Gefahrenbereich: Spieler entfernen
                </h4>
                <p className="text-xs text-rose-600 mb-4">
                  Dies löscht den Spieler {player.name} dauerhaft aus dem Verein. Die Kontostände und alle Verläufe gehen verloren.
                </p>

                {showDeleteConfirm ? (
                  <div className="p-3 bg-white border border-rose-200 rounded-xl space-y-3 shadow-2xs">
                    <span className="text-xs font-semibold text-slate-700 block">Sicher, dass du den Spieler löschen möchtest?</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded text-xs transition cursor-pointer"
                      >
                        Nein, abbrechen
                      </button>
                      <button
                        onClick={() => {
                          if (isAdminMode) {
                            onDeletePlayer(player.id);
                            onClose();
                          } else {
                            onTriggerAdminPrompt('delete_player');
                          }
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded text-xs transition cursor-pointer"
                      >
                        Ja, dauerhaft löschen
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (isAdminMode) {
                        setShowDeleteConfirm(true);
                      } else {
                        onTriggerAdminPrompt('delete_player');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 text-rose-600 hover:text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Spieler entfernen
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
