import React, { useState } from 'react';
import { Player, Drink, Fine } from '../types';
import { Zap, Beer, AlertTriangle, Users, Check, Circle, CheckCircle2, Lock } from 'lucide-react';

interface QuickBookingProps {
  players: Player[];
  drinks: Drink[];
  fines: Fine[];
  onBulkBook: (playerIds: string[], type: 'drink' | 'fine', itemId: string) => void;
  isAuthorized: boolean;
}

export default function QuickBooking({ players, drinks, fines, onBulkBook, isAuthorized }: QuickBookingProps) {
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [bookingType, setBookingType] = useState<'drink' | 'fine'>('drink');
  const [selectedItemId, setSelectedItemId] = useState<string>('');

  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Clear selections when authorization state changes to unlocked
  React.useEffect(() => {
    if (isAuthorized) {
      setSelectedPlayerIds([]);
      setSelectedItemId('');
    }
  }, [isAuthorized]);

  const togglePlayerSelect = (id: string) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedPlayerIds.length === players.length) {
      setSelectedPlayerIds([]);
    } else {
      setSelectedPlayerIds(players.map((p) => p.id));
    }
  };

  const handleBook = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPlayerIds.length === 0) {
      setMessage({ text: 'Wähle mindestens einen Spieler aus!', isError: true });
      return;
    }
    if (!selectedItemId) {
      setMessage({ text: 'Wähle ein Produkt oder Vergehen aus!', isError: true });
      return;
    }

    onBulkBook(selectedPlayerIds, bookingType, selectedItemId);

    if (isAuthorized) {
      const itemName =
        bookingType === 'drink'
          ? drinks.find((d) => d.id === selectedItemId)?.name
          : fines.find((f) => f.id === selectedItemId)?.name;

      setMessage({
        text: `Erfolgreich "${itemName}" für ${selectedPlayerIds.length} Spieler gebucht!`,
        isError: false,
      });

      // Clear selections
      setSelectedPlayerIds([]);
      setSelectedItemId('');

      setTimeout(() => {
        setMessage(null);
      }, 4000);
    }
  };

  // Set default selected item when changing type
  const handleTypeChange = (type: 'drink' | 'fine') => {
    setBookingType(type);
    setSelectedItemId('');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm" id="quick-booking-container">
      <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-1">
        <Zap className="text-[#FF6B00] w-4 h-4" />
        Blitz-Sammelbuchung
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        Schnellbuchung für das ganze Team (z.B. nach dem Training oder Spiel).
      </p>

      {message && (
        <div
          className={`p-3 rounded-xl text-xs mb-4 border ${
            message.isError
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleBook} className="space-y-4">
        {/* Step 1: Select Players */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <Users className="w-3 h-3 text-[#FF6B00]" />
              1. Spieler auswählen ({selectedPlayerIds.length})
            </span>
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[10px] text-[#FF6B00] hover:text-orange-700 font-bold"
            >
              {selectedPlayerIds.length === players.length ? 'Alle abwählen' : 'Alle auswählen'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
            {players.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-4 col-span-2">Keine Spieler vorhanden.</p>
            ) : (
              players.map((player) => {
                const isSelected = selectedPlayerIds.includes(player.id);
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => togglePlayerSelect(player.id)}
                    className={`flex items-center gap-2 p-2 rounded-xl text-xs text-left border transition-all ${
                      isSelected
                        ? 'bg-orange-50 border-[#FF6B00] text-[#FF6B00] font-bold'
                        : 'bg-slate-50/50 border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <div className="shrink-0">
                      {isSelected ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#FF6B00]" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-slate-300" />
                      )}
                    </div>
                    <span className="truncate">{player.name}</span>
                    {player.number && (
                      <span className="text-[9px] font-mono text-slate-500 ml-auto bg-slate-100 border border-slate-200 px-1 rounded">
                        #{player.number}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Step 2: Select Type and Item */}
        <div className="grid grid-cols-2 gap-3">
          {/* Booking Type Select */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
              2. Kategorie
            </label>
            <div className="flex bg-slate-100 border border-slate-200 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => handleTypeChange('drink')}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-lg font-semibold transition ${
                  bookingType === 'drink'
                    ? 'bg-[#FF6B00] text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Beer className="w-3.5 h-3.5" />
                Getränk
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('fine')}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-lg font-semibold transition ${
                  bookingType === 'fine'
                    ? 'bg-[#FF6B00] text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Strafe
              </button>
            </div>
          </div>

          {/* Product Select */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
              3. Produkt / Strafe
            </label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#FF6B00] h-[38px] shadow-xs"
            >
              <option value="">-- Auswählen --</option>
              {bookingType === 'drink'
                ? drinks
                    .filter((d) => d.isActive)
                    .map((drink) => (
                      <option key={drink.id} value={drink.id}>
                        {drink.name} ({drink.price.toFixed(2)} €)
                      </option>
                    ))
                : fines
                    .filter((f) => f.isActive)
                    .map((fine) => (
                      <option key={fine.id} value={fine.id}>
                        {fine.name} ({fine.amount.toFixed(2)} €)
                      </option>
                    ))}
            </select>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="w-full bg-[#FF6B00] hover:bg-orange-600 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 duration-150 shadow-sm cursor-pointer"
        >
          {isAuthorized ? (
            <Zap className="w-3.5 h-3.5" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-orange-200" />
          )}
          <span>{isAuthorized ? "Sammelbuchung durchführen" : "Freigabe zum Buchen erforderlich"}</span>
        </button>
      </form>
    </div>
  );
}
