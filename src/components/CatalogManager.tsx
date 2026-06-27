import React, { useState } from 'react';
import { Drink, Fine } from '../types';
import { Plus, Trash, RotateCcw, AlertTriangle, Beer, Check, Info } from 'lucide-react';

interface CatalogManagerProps {
  drinks: Drink[];
  fines: Fine[];
  onUpdateDrinks: (drinks: Drink[]) => void;
  onUpdateFines: (fines: Fine[]) => void;
  onResetToDefaults: () => void;
}

export default function CatalogManager({
  drinks,
  fines,
  onUpdateDrinks,
  onUpdateFines,
  onResetToDefaults,
}: CatalogManagerProps) {
  const [activeTab, setActiveTab] = useState<'drinks' | 'fines'>('drinks');

  // Drink Form State
  const [newDrinkName, setNewDrinkName] = useState('');
  const [newDrinkPrice, setNewDrinkPrice] = useState('');

  // Fine Form State
  const [newFineName, setNewFineName] = useState('');
  const [newFineAmount, setNewFineAmount] = useState('');

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Add Drink
  const handleAddDrink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDrinkName.trim() || !newDrinkPrice) return;
    const price = parseFloat(newDrinkPrice);
    if (isNaN(price) || price < 0) return;

    const newDrink: Drink = {
      id: 'd_' + Date.now(),
      name: newDrinkName.trim(),
      price: price,
      isActive: true,
    };

    onUpdateDrinks([...drinks, newDrink]);
    setNewDrinkName('');
    setNewDrinkPrice('');
  };

  // Add Fine
  const handleAddFine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFineName.trim() || !newFineAmount) return;
    const amount = parseFloat(newFineAmount);
    if (isNaN(amount) || amount < 0) return;

    const newFine: Fine = {
      id: 'f_' + Date.now(),
      name: newFineName.trim(),
      amount: amount,
      isActive: true,
    };

    onUpdateFines([...fines, newFine]);
    setNewFineName('');
    setNewFineAmount('');
  };

  // Update Price
  const handlePriceChange = (id: string, priceStr: string) => {
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) return;
    onUpdateDrinks(
      drinks.map((d) => (d.id === id ? { ...d, price } : d))
    );
  };

  // Update Fine Amount
  const handleAmountChange = (id: string, amountStr: string) => {
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount < 0) return;
    onUpdateFines(
      fines.map((f) => (f.id === id ? { ...f, amount } : f))
    );
  };

  // Toggle Active Drink
  const handleToggleDrink = (id: string) => {
    onUpdateDrinks(
      drinks.map((d) => (d.id === id ? { ...d, isActive: !d.isActive } : d))
    );
  };

  // Toggle Active Fine
  const handleToggleFine = (id: string) => {
    onUpdateFines(
      fines.map((f) => (f.id === id ? { ...f, isActive: !f.isActive } : f))
    );
  };

  // Delete Drink
  const handleDeleteDrink = (id: string) => {
    onUpdateDrinks(drinks.filter((d) => d.id !== id));
  };

  // Delete Fine
  const handleDeleteFine = (id: string) => {
    onUpdateFines(fines.filter((f) => f.id !== id));
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm" id="catalog-manager-container">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Beer className="text-[#FF6B00] w-5 h-5" />
            Tarife &amp; Strafen verwalten
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Hier kannst du Getränkepreise und den offiziellen Strafenkatalog anpassen.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg text-xs transition-all border border-slate-200 cursor-pointer"
            title="Auf Standardwerte zurücksetzen"
            id="reset-catalog-btn"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Zurücksetzen
          </button>
        </div>
      </div>

      {/* Confirm Reset Alert */}
      {showResetConfirm && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex flex-col gap-3">
          <div className="flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900">Standardwerte wiederherstellen?</span>
              <p className="mt-1 text-slate-600">
                Dies setzt alle Getränkepreise und Strafgebühren auf die Standardeinstellungen zurück. Bestehende Kontostände bleiben unverändert.
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-md transition"
            >
              Abbrechen
            </button>
            <button
              onClick={() => {
                onResetToDefaults();
                setShowResetConfirm(false);
              }}
              className="px-3 py-1 bg-[#FF6B00] hover:bg-orange-600 text-white font-semibold rounded-md transition cursor-pointer"
            >
              Ja, zurücksetzen
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-100 mb-6" id="catalog-tabs">
        <button
          onClick={() => setActiveTab('drinks')}
          className={`flex-1 py-2.5 text-sm font-semibold transition border-b-2 px-4 ${
            activeTab === 'drinks'
              ? 'border-[#FF6B00] text-[#FF6B00] bg-orange-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          id="tab-drinks-btn"
        >
          🍺 Getränkeliste ({drinks.length})
        </button>
        <button
          onClick={() => setActiveTab('fines')}
          className={`flex-1 py-2.5 text-sm font-semibold transition border-b-2 px-4 ${
            activeTab === 'fines'
              ? 'border-[#FF6B00] text-[#FF6B00] bg-orange-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          id="tab-fines-btn"
        >
          📜 Strafenkatalog ({fines.length})
        </button>
      </div>

      {/* DRINKS VIEW */}
      {activeTab === 'drinks' && (
        <div className="space-y-6" id="drinks-catalog-panel">
          {/* Add Drink Form */}
          <form onSubmit={handleAddDrink} className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50/50 border border-slate-200 rounded-xl">
            <div className="sm:col-span-1.5">
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Getränk Name</label>
              <input
                type="text"
                placeholder="z.B. Radler, Cola, Spezi"
                value={newDrinkName}
                onChange={(e) => setNewDrinkName(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#FF6B00]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Preis (€)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                placeholder="z.B. 1.50"
                value={newDrinkPrice}
                onChange={(e) => setNewDrinkPrice(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#FF6B00]"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full bg-[#FF6B00] hover:bg-orange-600 text-white text-sm font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Hinzufügen
              </button>
            </div>
          </form>

          {/* List of Drinks */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {drinks.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-4">Keine Getränke angelegt.</p>
            ) : (
              drinks.map((drink) => (
                <div
                  key={drink.id}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    drink.isActive
                      ? 'bg-slate-50/30 border-slate-200/60'
                      : 'bg-slate-50/10 border-slate-100 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`p-1.5 rounded-lg ${drink.isActive ? 'bg-orange-50 text-[#FF6B00]' : 'bg-slate-100 text-slate-400'}`}>
                       <Beer className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-slate-800 block truncate">{drink.name}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-xs">
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={drink.price.toFixed(2)}
                        onChange={(e) => handlePriceChange(drink.id, e.target.value)}
                        className="w-14 bg-transparent border-none text-right font-mono text-sm text-slate-800 focus:outline-none focus:ring-0 p-0"
                      />
                      <span className="text-xs text-slate-400 ml-1">€</span>
                    </div>

                    {/* Active Checkbox */}
                    <button
                      onClick={() => handleToggleDrink(drink.id)}
                      className={`p-1 rounded-md border text-xs cursor-pointer ${
                        drink.isActive
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-600 font-medium'
                          : 'bg-slate-100 border-slate-200 text-slate-400'
                      }`}
                      title={drink.isActive ? 'Aktiviert (Klicken zum Deaktivieren)' : 'Deaktiviert (Klicken zum Aktivieren)'}
                    >
                      {drink.isActive ? 'Aktiv' : 'Inaktiv'}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDeleteDrink(drink.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      title="Löschen"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* FINES VIEW */}
      {activeTab === 'fines' && (
        <div className="space-y-6" id="fines-catalog-panel">
          {/* Add Fine Form */}
          <form onSubmit={handleAddFine} className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50/50 border border-slate-200 rounded-xl">
            <div className="sm:col-span-1.5">
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Vergehen / Strafe</label>
              <input
                type="text"
                placeholder="z.B. Zuspätkommen, Trikot vergessen"
                value={newFineName}
                onChange={(e) => setNewFineName(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#FF6B00]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Betrag (€)</label>
              <input
                type="number"
                step="0.50"
                min="0"
                placeholder="z.B. 5.00"
                value={newFineAmount}
                onChange={(e) => setNewFineAmount(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#FF6B00]"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full bg-[#FF6B00] hover:bg-orange-600 text-white text-sm font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Hinzufügen
              </button>
            </div>
          </form>

          {/* List of Fines */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {fines.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-4">Keine Strafen angelegt.</p>
            ) : (
              fines.map((fine) => (
                <div
                  key={fine.id}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    fine.isActive
                      ? 'bg-slate-50/30 border-slate-200/60'
                      : 'bg-slate-50/10 border-slate-100 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`p-1.5 rounded-lg ${fine.isActive ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-slate-800 block truncate">{fine.name}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-xs">
                      <input
                        type="number"
                        step="0.50"
                        min="0"
                        value={fine.amount.toFixed(2)}
                        onChange={(e) => handleAmountChange(fine.id, e.target.value)}
                        className="w-14 bg-transparent border-none text-right font-mono text-sm text-slate-800 focus:outline-none focus:ring-0 p-0"
                      />
                      <span className="text-xs text-slate-400 ml-1">€</span>
                    </div>

                    {/* Active Checkbox */}
                    <button
                      onClick={() => handleToggleFine(fine.id)}
                      className={`p-1 rounded-md border text-xs cursor-pointer ${
                        fine.isActive
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-600 font-medium'
                          : 'bg-slate-100 border-slate-200 text-slate-400'
                      }`}
                      title={fine.isActive ? 'Aktiviert (Klicken zum Deaktivieren)' : 'Deaktiviert (Klicken zum Aktivieren)'}
                    >
                      {fine.isActive ? 'Aktiv' : 'Inaktiv'}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDeleteFine(fine.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      title="Löschen"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
