import React, { useState } from 'react';
import { Expense } from '../types';
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
  totalPaid: number;
  isAdminMode: boolean;
  setIsAdminMode: (isAdmin: boolean) => void;
}

export default function ExpenseModal({
  isOpen,
  onClose,
  expenses,
  onAddExpense,
  onDeleteExpense,
  totalPaid,
  isAdminMode,
  setIsAdminMode
}: ExpenseModalProps) {
  // State for adding new expense
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  
  // Admin simulation state
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPinForm, setShowPinForm] = useState(false);

  if (!isOpen) return null;

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netCash = totalPaid - totalExpenses;

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
      createdBy: 'Admin'
    });

    // Reset fields
    setTitle('');
    setAmountStr('');
    setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
  };

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
              <p className="text-xs text-slate-500">Transparente Übersicht aller Vereinsausgaben</p>
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
          {/* Cash Register Ledger Concept */}
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 grid grid-cols-3 gap-2 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/10 rounded-full blur-2xl"></div>
            
            <div className="space-y-1 border-r border-slate-200/60">
              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">Einnahmen (Ist)</span>
              <p className="text-base sm:text-lg font-black text-slate-700 font-mono">+{totalPaid.toFixed(2)} €</p>
              <span className="text-[9px] text-slate-400 block">Eingezahlte Beiträge</span>
            </div>

            <div className="space-y-1 border-r border-slate-200/60">
              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">Ausgaben</span>
              <p className="text-base sm:text-lg font-black text-rose-600 font-mono">-{totalExpenses.toFixed(2)} €</p>
              <span className="text-[9px] text-slate-400 block">{expenses.length} Buchungen</span>
            </div>

            <div className="space-y-1">
              <span className="text-[9px] uppercase font-bold text-emerald-600 block tracking-wider">Kassenbestand</span>
              <p className={`text-base sm:text-xl font-black font-mono ${netCash >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {netCash.toFixed(2)} €
              </p>
              <span className="text-[9px] text-emerald-600 font-semibold block">Tatsächliches Geld</span>
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
                      ? 'Du kannst neue Ausgaben eintragen und bestehende Buchungen löschen.' 
                      : 'Du siehst alle verbuchten Ausgaben. Um selbst Ausgaben hinzuzufügen, aktiviere den Admin-Modus.'}
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Zweck / Beschreibung</label>
                    <input
                      type="text"
                      placeholder="z.B. 3 Kisten Bier gekauft, Schiri-Gebühr..."
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
                      placeholder="z.B. Beleg bei Florian hinterlegt"
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
                    Ausgabe buchen
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* List of recorded expenses */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Buchungsposten / Verlauf ({expenses.length})
            </h3>

            {expenses.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl p-4 bg-slate-50/30">
                <TrendingDown className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-500">Noch keine Ausgaben erfasst</p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Aktiviere den Admin-Modus, um die erste Ausgabe (z.B. Getränkeeinkauf) zu verbuchen.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {[...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((exp) => (
                  <div 
                    key={exp.id}
                    className="flex justify-between items-center bg-white border border-slate-100 hover:border-slate-200 rounded-xl p-3 shadow-3xs transition"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 shrink-0 mt-0.5">
                        <TrendingDown className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{exp.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(exp.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </span>
                          {exp.notes && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[150px] italic">"{exp.notes}"</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-black text-rose-600">
                        -{exp.amount.toFixed(2)} €
                      </span>
                      {isAdminMode && (
                        <button
                          onClick={() => onDeleteExpense(exp.id)}
                          title="Löschen"
                          className="p-1 text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
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
            Der Kassenbestand aktualisiert sich automatisch bei jeder Einnahme (Mitglieder-Zahlung) und Ausgabe. Alle Daten bleiben sicher im Browser offline gespeichert.
          </span>
        </div>
      </div>
    </div>
  );
}
