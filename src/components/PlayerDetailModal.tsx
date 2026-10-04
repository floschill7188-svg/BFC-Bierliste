import React, { useState } from 'react';
import { Player, Drink, Fine, Transaction } from '../types';
import { X, Trash2, Plus, Minus, CreditCard, History, Edit2, Check, UserPlus, Save, AlertTriangle, Lock } from 'lucide-react';

interface PlayerDetailModalProps {
  player: Player | null;
  drinks: Drink[];
  fines: Fine[];
  transactions: Transaction[];
  initialTeam?: 'Herren 1' | 'Herren 2';
  onClose: () => void;
  onAddDrink: (playerId: string, drinkId: string, team?: 'Herren 1' | 'Herren 2') => void;
  onRemoveDrink: (playerId: string, drinkId: string, team?: 'Herren 1' | 'Herren 2') => void;
  onAddFine: (playerId: string, fineId: string, team?: 'Herren 1' | 'Herren 2') => void;
  onRemoveFine: (playerId: string, fineId: string, team?: 'Herren 1' | 'Herren 2') => void;
  onAddPayment: (playerId: string, amount: number, team?: 'Herren 1' | 'Herren 2') => void;
  onUpdatePlayer: (id: string, name: string, number?: string, teams?: ('Herren 1' | 'Herren 2')[], email?: string) => void;
  onDeletePlayer: (id: string) => void;
  isAdminMode: boolean;
  isAuthorized: boolean;
  onTriggerAdminPrompt: (actionType: 'edit_player' | 'delete_player') => void;
}

export default function PlayerDetailModal({
  player,
  drinks,
  fines,
  transactions,
  initialTeam = 'Herren 1',
  onClose,
  onAddDrink,
  onRemoveDrink,
  onAddFine,
  onRemoveFine,
  onAddPayment,
  onUpdatePlayer,
  onDeletePlayer,
  isAdminMode,
  isAuthorized,
  onTriggerAdminPrompt,
}: PlayerDetailModalProps) {
  if (!player) return null;

  const isMultiTeam = (player.teams && player.teams.length > 1) || (player.teams?.includes('Herren 1') && player.teams?.includes('Herren 2'));
  const [activeTeamTab, setActiveTeamTab] = useState<'Herren 1' | 'Herren 2'>(() => {
    if (initialTeam && player.teams?.includes(initialTeam)) return initialTeam;
    if (player.teams?.includes('Herren 2') && !player.teams?.includes('Herren 1')) return 'Herren 2';
    return 'Herren 1';
  });

  const [activeSubTab, setActiveSubTab] = useState<'consume' | 'history' | 'edit'>('consume');
  const [historyTeamFilter, setHistoryTeamFilter] = useState<'all' | 'Herren 1' | 'Herren 2'>('all');

  // Settle state
  const [paymentAmount, setPaymentAmount] = useState('');

  // Edit player state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(player.name);
  const [editEmail, setEditEmail] = useState(player.email || '');
  const [editNumber, setEditNumber] = useState(player.number || '');
  const [editTeams, setEditTeams] = useState<('Herren 1' | 'Herren 2')[]>(player.teams || (player.team ? [player.team] : ['Herren 1']));
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Email status state
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatusMessage, setEmailStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Calculate costs per team
  const getStats = (teamKey?: 'Herren 1' | 'Herren 2') => {
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

    const totalCost = drinksCost + finesCost;
    const balance = Number((totalCost - paid).toFixed(2));
    const points = Object.entries(fCount).reduce((acc, [fineId, qty]) => {
      const fine = fines.find((f) => f.id === fineId);
      return acc + (fine && fine.points ? fine.points * Number(qty) : 0);
    }, 0);

    return { drinksCost, finesCost, totalCost, paid, balance, points, dCount, fCount };
  };

  const currentStats = isMultiTeam ? getStats(activeTeamTab) : getStats();
  const h1Stats = getStats('Herren 1');
  const h2Stats = getStats('Herren 2');

  const totalCost = currentStats.totalCost;
  const balance = currentStats.balance;
  const currentTotalPaid = currentStats.paid;
  const totalPoints = currentStats.points;
  const activeDrinksCount = currentStats.dCount;
  const activeFinesCount = currentStats.fCount;

  const effectiveTeam = isMultiTeam ? activeTeamTab : (player.teams?.[0] || player.team || 'Herren 1');

  const handleSendPlayerEmail = async () => {
    if (!player.email) return;
    setIsSendingEmail(true);
    setEmailStatusMessage(null);

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: player.email,
          name: player.name,
          betrag: isMultiTeam ? Number((h1Stats.balance + h2Stats.balance).toFixed(2)) : balance,
          h1Betrag: h1Stats.balance,
          h2Betrag: h2Stats.balance,
          isMultiTeam
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setEmailStatusMessage({ text: `E-Mail erfolgreich an ${player.email} gesendet! 📩`, isError: false });
      } else {
        setEmailStatusMessage({ text: data.error || 'Fehler beim Senden der E-Mail', isError: true });
      }
    } catch (err: any) {
      setEmailStatusMessage({ text: 'Netzwerkfehler: ' + (err.message || 'Server nicht erreichbar'), isError: true });
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Filter player-specific transactions
  const playerTransactions = transactions
    .filter((t) => {
      const matchesPlayer = t.playerId === player.id;
      if (!matchesPlayer) return false;
      if (historyTeamFilter !== 'all') {
        return (t.team || 'Herren 1') === historyTeamFilter;
      }
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const handleSavePlayerInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    onUpdatePlayer(player.id, editName.trim(), editNumber.trim() || undefined, editTeams, editEmail.trim() || undefined);
    setIsEditing(false);
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;
    if (!isAdminMode) {
      onAddPayment(player.id, amount, effectiveTeam); // Will trigger admin PIN prompt
      return;
    }
    onAddPayment(player.id, amount, effectiveTeam);
    setPaymentAmount('');
  };

  const handleSettleFull = () => {
    if (balance <= 0) return;
    if (!isAdminMode) {
      onAddPayment(player.id, balance, effectiveTeam); // Will trigger admin PIN prompt
      return;
    }
    onAddPayment(player.id, balance, effectiveTeam);
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
                    placeholder="Name"
                    required
                  />
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="bg-white border border-slate-200 text-xs rounded-lg px-2 py-1 text-slate-800 focus:outline-none focus:border-[#FF6B00]"
                    placeholder="E-Mail Adresse"
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
                      if (isAdminMode || isAuthorized) {
                        setIsEditing(true);
                      } else {
                        onTriggerAdminPrompt('edit_player');
                      }
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded transition cursor-pointer"
                    title="Profil & E-Mail bearbeiten"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <p className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                <span>Mitglieder-Abrechnung • {player.teams && player.teams.length > 0 ? player.teams.join(' & ') : (player.team || 'Herren 1')}</span>
                {player.email && <span className="text-slate-400">({player.email})</span>}
              </p>
              {player.email ? (
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleSendPlayerEmail}
                    disabled={isSendingEmail}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 active:scale-95 text-blue-700 border border-blue-200/80 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    <span>{isSendingEmail ? 'Wird gesendet...' : '✉️ Kontostand-Mail senden'}</span>
                  </button>
                  {emailStatusMessage && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${emailStatusMessage.isError ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                      {emailStatusMessage.text}
                    </span>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (isAdminMode || isAuthorized) {
                      setIsEditing(true);
                    } else {
                      onTriggerAdminPrompt('edit_player');
                    }
                  }}
                  className="text-[11px] text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-2 py-1 rounded-md mt-1.5 inline-flex items-center gap-1 font-medium transition cursor-pointer"
                >
                  <span>✉️ Keine E-Mail hinterlegt. Hier klicken zum Hinzufügen.</span>
                </button>
              )}
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

        {/* If Player in multiple teams: Team Selector Tabs */}
        {isMultiTeam && (
          <div className="flex gap-2 p-2 bg-slate-100 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTeamTab('Herren 1')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                activeTeamTab === 'Herren 1'
                  ? 'bg-[#FF6B00] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-white/70 hover:bg-white'
              }`}
            >
              <span>🏀 Kasse Herren 1</span>
              <span className={`font-mono px-2 py-0.5 rounded text-[11px] font-extrabold ${
                activeTeamTab === 'Herren 1' ? 'bg-black/20 text-white' : 'bg-slate-200 text-slate-800'
              }`}>
                {h1Stats.balance === 0 ? '0,00 €' : h1Stats.balance < 0 ? `-${Math.abs(h1Stats.balance).toFixed(2)} €` : `+${h1Stats.balance.toFixed(2)} €`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTeamTab('Herren 2')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                activeTeamTab === 'Herren 2'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-white/70 hover:bg-white'
              }`}
            >
              <span>🏀 Kasse Herren 2</span>
              <span className={`font-mono px-2 py-0.5 rounded text-[11px] font-extrabold ${
                activeTeamTab === 'Herren 2' ? 'bg-black/20 text-white' : 'bg-slate-200 text-slate-800'
              }`}>
                {h2Stats.balance === 0 ? '0,00 €' : h2Stats.balance < 0 ? `-${Math.abs(h2Stats.balance).toFixed(2)} €` : `+${h2Stats.balance.toFixed(2)} €`}
              </span>
            </button>
          </div>
        )}

        {/* Balance Cards Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-6 py-4 bg-slate-50/50 border-b border-slate-100">
          <div className="p-3 bg-white rounded-xl border border-slate-100 text-center shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              {balance < 0 ? 'Guthaben' : 'Ausstehend'} {isMultiTeam && `(${activeTeamTab === 'Herren 1' ? 'H1' : 'H2'})`}
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
              {currentTotalPaid.toFixed(2)} €
            </p>
          </div>
          <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/60 text-center shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">Strafpunkte</span>
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              <p className="text-lg font-black text-amber-600 font-mono">
                {totalPoints} P
              </p>
              {totalPoints >= 3 && (
                <span className="text-[10px] px-2 py-0.5 bg-rose-100 text-rose-800 font-bold rounded-full border border-rose-200" title="Zusatz-Dienste fällig">
                  {Math.floor(totalPoints / 3)}D
                </span>
              )}
            </div>
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
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs uppercase font-extrabold text-slate-500 tracking-wider">
                    Getränkekonsum eintragen {isMultiTeam && `(für ${effectiveTeam})`}
                  </h3>
                  {isMultiTeam && (
                    <span className="text-[10px] font-bold text-[#FF6B00] bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200">
                      Aktiv: {effectiveTeam}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {drinks.filter((d) => d.isActive).map((drink) => {
                    const count = activeDrinksCount[drink.id] || 0;
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
                            onClick={() => onRemoveDrink(player.id, drink.id, effectiveTeam)}
                            disabled={count === 0}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              count > 0
                                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                            }`}
                            title={!isAuthorized ? "Freigabe erforderlich" : undefined}
                          >
                            {!isAuthorized && count > 0 ? (
                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <Minus className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <span className="font-mono font-bold text-sm text-slate-800 w-6 text-center">{count}</span>
                          <button
                            onClick={() => onAddDrink(player.id, drink.id, effectiveTeam)}
                            className="p-1.5 bg-orange-50 hover:bg-[#FF6B00] border border-orange-200 hover:border-[#FF6B00] text-[#FF6B00] hover:text-white rounded-lg transition cursor-pointer flex items-center justify-center"
                            title={!isAuthorized ? "Freigabe erforderlich" : undefined}
                          >
                            {isAuthorized ? (
                              <Plus className="w-3.5 h-3.5" />
                            ) : (
                              <Lock className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Strafen Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs uppercase font-extrabold text-slate-500 tracking-wider">
                    Strafenkatalog anwenden {isMultiTeam && `(für ${effectiveTeam})`}
                  </h3>
                  {isMultiTeam && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      Aktiv: {effectiveTeam}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {fines.filter((f) => f.isActive).map((fine) => {
                    const count = activeFinesCount[fine.id] || 0;
                    return (
                      <div
                        key={fine.id}
                        className="flex items-center justify-between p-3 bg-slate-50/50 border border-slate-100 rounded-xl"
                      >
                        <div className="min-w-0 pr-2">
                          <span className="text-sm font-semibold text-slate-800 block truncate" title={fine.name}>
                            {fine.name}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-amber-600 font-mono font-bold">{fine.amount.toFixed(2)} €</span>
                            {fine.points ? (
                              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded font-sans">
                                +{fine.points} Pkt.
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <button
                            onClick={() => onRemoveFine(player.id, fine.id, effectiveTeam)}
                            disabled={count === 0}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              count > 0
                                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                            }`}
                            title={!isAdminMode ? "Trainer-Freigabe erforderlich" : undefined}
                          >
                            {!isAdminMode && count > 0 ? (
                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <Minus className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <span className="font-mono font-bold text-sm text-slate-800 w-6 text-center">{count}</span>
                          <button
                            onClick={() => onAddFine(player.id, fine.id, effectiveTeam)}
                            className="p-1.5 bg-amber-50 hover:bg-amber-500 border border-amber-200 hover:border-amber-500 text-amber-600 hover:text-white rounded-lg transition cursor-pointer flex items-center justify-center"
                            title={!isAdminMode ? "Trainer-Freigabe erforderlich" : undefined}
                          >
                            {isAdminMode ? (
                              <Plus className="w-3.5 h-3.5" />
                            ) : (
                              <Lock className="w-3.5 h-3.5" />
                            )}
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
                  Guthaben einzahlen / Begleichen {isMultiTeam && `(Kasse: ${effectiveTeam})`}
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Trage bar bezahltes Geld ein, um den Kontostand für {effectiveTeam} auszugleichen.
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
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-4 py-2 rounded-lg transition active:scale-95 shrink-0 cursor-pointer flex items-center gap-1.5"
                  >
                    {!isAdminMode && <Lock className="w-3.5 h-3.5 text-emerald-200" />}
                    <span>Einzahlen ({effectiveTeam})</span>
                  </button>

                  {balance > 0 && (
                    <button
                      type="button"
                      onClick={handleSettleFull}
                      className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-sm px-4 py-2 rounded-lg transition shrink-0 cursor-pointer shadow-2xs flex items-center gap-1.5"
                    >
                      {!isAdminMode && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                      <span>Alles ({balance.toFixed(2)} €) begleichen</span>
                    </button>
                  )}
                </form>
              </div>
            </div>
          )}

          {/* HISTORY TAB */}
          {activeSubTab === 'history' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs uppercase font-extrabold text-slate-500 tracking-wider">
                  Buchungsverlauf von {player.name}
                </h3>
                {isMultiTeam && (
                  <div className="flex gap-1 text-[10px] font-bold bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setHistoryTeamFilter('all')}
                      className={`px-2 py-0.5 rounded cursor-pointer transition ${
                        historyTeamFilter === 'all' ? 'bg-slate-800 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Alle Teams
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryTeamFilter('Herren 1')}
                      className={`px-2 py-0.5 rounded cursor-pointer transition ${
                        historyTeamFilter === 'Herren 1' ? 'bg-[#FF6B00] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Herren 1
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryTeamFilter('Herren 2')}
                      className={`px-2 py-0.5 rounded cursor-pointer transition ${
                        historyTeamFilter === 'Herren 2' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Herren 2
                    </button>
                  </div>
                )}
              </div>

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
                        <div className="flex items-center gap-1.5 flex-wrap">
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
                          {tx.team && (
                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                              tx.team === 'Herren 1' ? 'bg-orange-100 text-orange-800 border border-orange-200' : 'bg-blue-100 text-blue-800 border border-blue-200'
                            }`}>
                              {tx.team === 'Herren 1' ? 'H1' : 'H2'}
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
