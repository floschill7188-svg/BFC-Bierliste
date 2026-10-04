import React, { useState } from 'react';
import { Expense, Team } from '../types';
import { 
  X, 
  Coins, 
  TrendingDown, 
  Plus, 
  Trash2, 
  Lock, 
  Unlock, 
  Calendar, 
  Info, 
  AlertCircle,
  FileText
} from 'lucide-react';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  expenses: Expense[];
  onAddExpense: (expense: Omit<Expense, 'id'>) => void;
  onDeleteExpense: (id: string) => void;
  h1Paid: number;
  h2Paid: number;
  defaultTeam?: Team;
  manualCashAdjustment?: number;
  isAdminMode: boolean;
  setIsAdminMode: (isAdmin: boolean) => void;
}

export default function ExpenseModal({
  isOpen,
  onClose,
  expenses,
  onAddExpense,
  onDeleteExpense,
  h1Paid,
  h2Paid,
  defaultTeam = 'Herren 1',
  manualCashAdjustment = 0,
  isAdminMode,
  setIsAdminMode
}: ExpenseModalProps) {
  // State for adding new expense
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [expenseTeam, setExpenseTeam] = useState<Team>(defaultTeam);
  const [historyFilterTeam, setHistoryFilterTeam] = useState<'all' | 'Herren 1' | 'Herren 2'>('all');
  
  // Admin simulation state
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPinForm, setShowPinForm] = useState(false);

  if (!isOpen) return null;

  const h1Expenses = expenses.filter(e => (e.team || 'Herren 1') === 'Herren 1').reduce((sum, e) => sum + e.amount, 0);
  const h2Expenses = expenses.filter(e => e.team === 'Herren 2').reduce((sum, e) => sum + e.amount, 0);

  const h1Net = Number((h1Paid - h1Expenses).toFixed(2));
  const h2Net = Number((h2Paid - h2Expenses).toFixed(2));
  const totalNet = Number((h1Net + h2Net + manualCashAdjustment).toFixed(2));

  const handleAdminToggle = () => {
    if (isAdminMode) {
      setIsAdminMode(false);
      setShowPinForm(false);
      setPinInput('');
      setPinError('');
    } else {
      setShowPinForm(true);
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '2016') {
      setIsAdminMode(true);
      setShowPinForm(false);
      setPinInput('');
      setPinError('');
    } else {
      setPinError('Falscher PIN!');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return;

    onAddExpense({
      title: title.trim(),
      amount,
      date,
      notes: notes.trim() || undefined,
      createdBy: 'Admin',
      team: expenseTeam
    });

    // Reset fields
    setTitle('');
    setAmountStr('');
    setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  const filteredExpenses = expenses.filter(e => {
    if (historyFilterTeam === 'all') return true;
    return (e.team || 'Herren 1') === historyFilterTeam;
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="expense-modal-backdrop">
      <div 
        className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-slate-100 animate-scale-up"
        id="expense-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Kassenbestand &amp; Ausgaben</h2>
              <p className="text-xs text-slate-500">2 getrennte Mannschaftskassen für Herren 1 &amp; Herren 2</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200/80 text-slate-400 hover:text-slate-600 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* 2 Separate Cash Register Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Kasse Herren 1 */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-extrabold text-[#FF6B00] tracking-wider flex items-center gap-1.5">
                  🏀 Kasse Herren 1
                </span>
                <span className={`text-base font-black font-mono px-2 py-0.5 rounded-lg border ${
                  h1Net >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  {h1Net.toFixed(2)} €
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[11px] font-mono pt-1 border-t border-slate-200/60">
                <div className="text-slate-500">
                  Eingezahlt: <span className="font-bold text-slate-800">+{h1Paid.toFixed(2)} €</span>
                </div>
                <div className="text-slate-500 text-right">
                  Ausgaben: <span className="font-bold text-rose-600">-{h1Expenses.toFixed(2)} €</span>
                </div>
              </div>
            </div>

            {/* Kasse Herren 2 */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-extrabold text-blue-600 tracking-wider flex items-center gap-1.5">
                  🏀 Kasse Herren 2
                </span>
                <span className={`text-base font-black font-mono px-2 py-0.5 rounded-lg border ${
                  h2Net >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  {h2Net.toFixed(2)} €
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[11px] font-mono pt-1 border-t border-slate-200/60">
                <div className="text-slate-500">
                  Eingezahlt: <span className="font-bold text-slate-800">+{h2Paid.toFixed(2)} €</span>
                </div>
                <div className="text-slate-500 text-right">
                  Ausgaben: <span className="font-bold text-rose-600">-{h2Expenses.toFixed(2)} €</span>
                </div>
              </div>
            </div>
          </div>

          {/* Admin Role Simulation Banner */}
          <div className={`p-4 rounded-2xl border transition-all ${
            isAdminMode 
              ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
              : 'bg-amber-50/70 border-amber-100 text-amber-800'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-2.5">
                <div className="mt-0.5">
                  {isAdminMode ? (
                    <Unlock className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Lock className="w-4 h-4 text-amber-600" />
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-bold">
                    {isAdminMode ? 'Admin-Modus Aktiviert' : 'Eingeschränkter Modus (Mitglieder-Ansicht)'}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isAdminMode 
                      ? 'Du kannst neue Ausgaben für Herren 1 oder Herren 2 eintragen und löschen.' 
                      : 'Du siehst alle verbuchten Ausgaben beider Kassen.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAdminToggle}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  isAdminMode 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs' 
                    : 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                }`}
              >
                {isAdminMode ? 'Sperren' : 'Als Admin anmelden'}
              </button>
            </div>

            {/* PIN Prompter */}
            {showPinForm && (
              <form onSubmit={handlePinSubmit} className="mt-4 pt-3 border-t border-amber-200/50 flex gap-2 items-center animate-fade-in">
                <div className="flex-1">
                  <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Admin-PIN eingeben</label>
                  <input
                    type="password"
                    placeholder="Admin-PIN"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#FF6B00]"
                    autoFocus
                  />
                </div>
                <div className="flex items-end self-end gap-1.5">
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Freischalten
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPinForm(false)}
                    className="px-2.5 py-1.5 hover:bg-slate-100 text-slate-500 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Abbrechen
                  </button>
                </div>
              </form>
            )}
            {pinError && <p className="text-[10px] text-rose-600 font-semibold mt-1 animate-fade-in">{pinError}</p>}
          </div>

          {/* New Expense Form (Only visible to Admin) */}
          {isAdminMode && (
            <div className="bg-slate-50/50 border border-slate-200/80 rounded-2xl p-4 space-y-3 animate-fade-in">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <Plus className="w-3.5 h-3.5 text-[#FF6B00]" />
                Neue Ausgabe verbuchen
              </h3>
              
              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Team Selection for Expense */}
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
                    Aus welcher Mannschaftskasse bezahlt?
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setExpenseTeam('Herren 1')}
                      className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                        expenseTeam === 'Herren 1'
                          ? 'border-[#FF6B00] bg-orange-50 text-[#FF6B00] shadow-xs'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      🏀 Kasse Herren 1
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpenseTeam('Herren 2')}
                      className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                        expenseTeam === 'Herren 2'
                          ? 'border-blue-500 bg-blue-50 text-blue-600 shadow-xs'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      🏀 Kasse Herren 2
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Zweck / Beschreibung</label>
                    <input
                      type="text"
                      placeholder="z.B. 3 Kisten Bier gekauft, Bälle..."
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#FF6B00]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Betrag (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={amountStr}
                      onChange={(e) => setAmountStr(e.target.value)}
                      required
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#FF6B00] font-mono text-right"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Datum</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#FF6B00]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Bemerkung (Optional)</label>
                    <input
                      type="text"
                      placeholder="z.B. Beleg bei Trainer hinterlegt"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#FF6B00]"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ausgabe für {expenseTeam} buchen
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* List of recorded expenses */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Buchungsposten / Verlauf ({filteredExpenses.length})
              </h3>
              
              {/* Filter tabs */}
              <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setHistoryFilterTeam('all')}
                  className={`px-2 py-1 rounded-md transition ${historyFilterTeam === 'all' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'}`}
                >
                  Alle Kassen
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilterTeam('Herren 1')}
                  className={`px-2 py-1 rounded-md transition ${historyFilterTeam === 'Herren 1' ? 'bg-[#FF6B00] text-white shadow-xs' : 'text-slate-500'}`}
                >
                  Herren 1
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilterTeam('Herren 2')}
                  className={`px-2 py-1 rounded-md transition ${historyFilterTeam === 'Herren 2' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500'}`}
                >
                  Herren 2
                </button>
              </div>
            </div>

            {filteredExpenses.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl p-4 bg-slate-50/30">
                <TrendingDown className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-500">Keine Ausgaben in dieser Ansicht</p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Aktiviere den Admin-Modus, um eine Ausgabe für die Mannschaftskasse zu verbuchen.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {[...filteredExpenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((exp) => (
                  <div 
                    key={exp.id}
                    className="flex justify-between items-center bg-white border border-slate-100 hover:border-slate-200 rounded-xl p-3 shadow-3xs transition"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="p-2 bg-rose-50 text-rose-600 rounded-lg shrink-0 mt-0.5">
                        <TrendingDown className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-slate-800 truncate">{exp.title}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                            (exp.team || 'Herren 1') === 'Herren 1'
                              ? 'bg-orange-50 text-[#FF6B00] border-orange-200'
                              : 'bg-blue-50 text-blue-600 border-blue-200'
                          }`}>
                            {exp.team || 'Herren 1'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(exp.date).toLocaleDateString('de-DE')}
                          </span>
                          {exp.notes && (
                            <span className="truncate max-w-[200px]" title={exp.notes}>
                              • {exp.notes}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-black text-rose-600 font-mono text-sm">
                        -{exp.amount.toFixed(2)} €
                      </span>
                      {isAdminMode && (
                        <button
                          type="button"
                          onClick={() => onDeleteExpense(exp.id)}
                          className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Ausgabe löschen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer info disclosure */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2 text-[10px] text-slate-400">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>
            Beide Mannschaftskassen werden strikt getrennt geführt. Einnahmen &amp; Ausgaben wirken sich nur auf die jeweilige Kasse aus.
          </span>
        </div>
      </div>
    </div>
  );
}

