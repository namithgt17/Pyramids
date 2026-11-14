'use client';

import { useState, useEffect } from 'react';

// Data types
interface Period {
  id: string;
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
  subject: string;
  time: string;
  room?: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export default function Home() {
  // 1. Timetable State
  const [timetable, setTimetable] = useState<Period[]>([]);
  const [bunks, setBunks] = useState<Record<string, number>>({});
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Form state for manual add
  const [newDay, setNewDay] = useState<Period['day']>('Monday');
  const [newSubject, setNewSubject] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newRoom, setNewRoom] = useState('');

  // Load saved timetable & bunks from browser LocalStorage
  useEffect(() => {
    const savedTimetable = localStorage.getItem('pyramids_timetable');
    if (savedTimetable) {
      try {
        setTimetable(JSON.parse(savedTimetable));
      } catch (e) {
        console.error(e);
      }
    }

    const savedBunks = localStorage.getItem('pyramids_bunks');
    if (savedBunks) {
      try {
        setBunks(JSON.parse(savedBunks));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  function saveTimetable(updated: Period[]) {
    setTimetable(updated);
    localStorage.setItem('pyramids_timetable', JSON.stringify(updated));
  }

  function saveBunks(updated: Record<string, number>) {
    setBunks(updated);
    localStorage.setItem('pyramids_bunks', JSON.stringify(updated));
  }

  // Bunk Actions
  function addBunk(subjectName: string) {
    const current = bunks[subjectName] || 0;
    const updated = { ...bunks, [subjectName]: current + 1 };
    saveBunks(updated);
  }

  function removeBunk(subjectName: string) {
    const current = bunks[subjectName] || 0;
    if (current <= 0) return;
    const updated = { ...bunks, [subjectName]: current - 1 };
    saveBunks(updated);
  }

  // Dynamically extract unique subjects strictly from the uploaded/configured timetable
  const uniqueSubjects = Array.from(new Set(timetable.map((p) => p.subject.trim()))).filter(Boolean);

  // Timetable Actions
  function handleAddPeriod(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubject.trim() || !newTime.trim()) return;

    const newPeriod: Period = {
      id: Date.now().toString(),
      day: newDay,
      subject: newSubject.trim(),
      time: newTime.trim(),
      room: newRoom.trim() || undefined,
    };

    saveTimetable([...timetable, newPeriod]);
    setNewSubject('');
    setNewTime('');
    setNewRoom('');
  }

  function handleDeletePeriod(id: string) {
    saveTimetable(timetable.filter((p) => p.id !== id));
  }

  // AI Photo Scanning Handler
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanError(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];

          const res = await fetch('/api/scan-timetable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: base64Data,
              mimeType: file.type || 'image/jpeg',
            }),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to scan timetable');

          if (Array.isArray(data.periods)) {
            const formatted: Period[] = data.periods.map((p: any, i: number) => ({
              id: `${Date.now()}-${i}`,
              day: p.day,
              subject: p.subject,
              time: p.time,
              room: p.room || undefined,
            }));

            saveTimetable([...timetable, ...formatted]);
          }
        } catch (fetchErr: any) {
          setScanError(fetchErr.message || 'Error processing image');
        } finally {
          setIsScanning(false);
        }
      };
      reader.onerror = () => {
        setScanError('Failed to read image file');
        setIsScanning(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setScanError(err.message || 'Error processing image');
      setIsScanning(false);
    }
  }

  // Today's Date Info
  const todayIndex = new Date().getDay();
  const todayName = DAYS[todayIndex];
  const todaysClasses = timetable.filter((p) => p.day === todayName);

  return (
    <main className="min-h-screen bg-black text-white p-6 sm:p-12">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* ================= HEADER ================= */}
        <header className="border-b border-zinc-800 pb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pyramids</h1>
            <p className="text-zinc-400 text-sm mt-1">College Life &amp; Academic OS</p>
          </div>
          <button
            onClick={() => setIsSetupOpen(true)}
            className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider py-2.5 px-4 rounded-xl transition active:scale-95 cursor-pointer"
          >
            Setup Timetable
          </button>
        </header>

        {/* ================= SECTION 1: TODAY'S SCHEDULE ================= */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
                Daily Schedule
              </span>
              <h2 className="text-2xl font-bold text-white mt-0.5">
                Today&apos;s Classes — {todayName}
              </h2>
            </div>
            <span className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-400 px-3 py-1 rounded-full">
              {todaysClasses.length} {todaysClasses.length === 1 ? 'class' : 'classes'} scheduled
            </span>
          </div>

          {todayName === 'Sunday' ? (
            <div className="p-8 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/50">
              <p className="text-lg font-semibold text-zinc-300">It&apos;s Sunday! No classes today.</p>
              <p className="text-sm text-zinc-500 mt-1">Rest up or catch up on your personal projects.</p>
            </div>
          ) : todaysClasses.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/50">
              <p className="text-lg font-semibold text-zinc-300">No classes configured for {todayName} yet.</p>
              <button
                onClick={() => {
                  setNewDay(todayName as Period['day']);
                  setIsSetupOpen(true);
                }}
                className="mt-3 text-xs uppercase font-bold tracking-wider text-black bg-white px-4 py-2 rounded-xl hover:bg-zinc-200 transition cursor-pointer"
              >
                + Add {todayName}&apos;s Timetable
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {todaysClasses.map((item, idx) => (
                <div
                  key={item.id}
                  className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-4 sm:p-5 flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-4">
                    <span className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
                      {idx + 1}
                    </span>
                    <div>
                      <h3 className="font-bold text-base sm:text-lg text-white">{item.subject}</h3>
                      <div className="flex items-center gap-3 text-xs text-zinc-400 mt-0.5">
                        <span className="text-zinc-300">{item.time}</span>
                        {item.room && <span>• Room {item.room}</span>}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs bg-zinc-900 text-zinc-400 border border-zinc-800 px-3 py-1 rounded-lg">
                    Scheduled
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ================= SECTION 2: BUNK TRACKER ================= */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
                Bunk Counter
              </span>
              <h2 className="text-2xl font-bold text-white mt-0.5">
                My Subjects &amp; Bunks
              </h2>
            </div>
            <span className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-400 px-3 py-1 rounded-full font-bold">
              {uniqueSubjects.length} {uniqueSubjects.length === 1 ? 'Subject' : 'Subjects'}
            </span>
          </div>

          {uniqueSubjects.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/50">
              <p className="text-base font-semibold text-zinc-300">No subjects found yet.</p>
              <p className="text-xs text-zinc-500 mt-1">
                Upload your timetable photo in Setup above to automatically pull your subjects!
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {uniqueSubjects.map((subjectName) => {
                const count = bunks[subjectName] || 0;

                return (
                  <div
                    key={subjectName}
                    className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between hover:border-zinc-700 transition"
                  >
                    <div>
                      <h3 className="font-semibold text-base sm:text-lg text-white mb-2">{subjectName}</h3>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-white">
                          {count}
                        </span>
                        <span className="text-xs text-zinc-400">
                          {count === 1 ? 'class bunked' : 'classes bunked'}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-5">
                      <button
                        onClick={() => addBunk(subjectName)}
                        className="flex-1 py-2.5 px-3 text-xs font-bold uppercase tracking-wider rounded-xl bg-white text-black hover:bg-zinc-200 active:scale-95 transition cursor-pointer"
                      >
                        + Bunked 1 Class
                      </button>
                      {count > 0 && (
                        <button
                          onClick={() => removeBunk(subjectName)}
                          className="py-2.5 px-3 text-xs font-bold uppercase rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 active:scale-95 transition cursor-pointer"
                          title="Undo / Reduce Bunk"
                        >
                          -1
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ================= SETUP TIMETABLE MODAL ================= */}
        {isSetupOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
              {/* Modal Header */}
              <div className="p-5 border-b border-zinc-800 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-white">Configure Timetable</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Upload a photo or enter manually</p>
                </div>
                <button
                  onClick={() => setIsSetupOpen(false)}
                  className="w-8 h-8 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-6">
                {/* AI PHOTO SCANNER CARD */}
                <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-700/80 rounded-xl p-5 text-center">
                  <h4 className="text-sm font-bold text-white">Auto-Scan with AI</h4>
                  <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                    Upload a photo or screenshot of your college timetable. Gemini AI will automatically extract all days and periods.
                  </p>

                  <label className="inline-block mt-4 cursor-pointer">
                    <span className="px-4 py-2.5 bg-white text-black font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-zinc-200 transition inline-flex items-center gap-2">
                      {isScanning ? 'Scanning with Gemini AI...' : 'Choose Timetable Photo'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isScanning}
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>

                  {isScanning && (
                    <p className="text-xs text-yellow-400 animate-pulse mt-3 font-semibold">
                      Parsing periods, subjects, and room numbers...
                    </p>
                  )}

                  {scanError && (
                    <p className="text-xs text-red-400 mt-3 font-semibold">
                      Error: {scanError}
                    </p>
                  )}
                </div>

                {/* MANUAL ADD FORM */}
                <form onSubmit={handleAddPeriod} className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-3">
                  <h4 className="text-xs uppercase font-bold text-zinc-400 tracking-wider">Or Add Manually</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-zinc-400 uppercase font-bold">Day</label>
                      <select
                        value={newDay}
                        onChange={(e) => setNewDay(e.target.value as Period['day'])}
                        className="w-full mt-1 bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                      >
                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-400 uppercase font-bold">Room (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. CS-204"
                        value={newRoom}
                        onChange={(e) => setNewRoom(e.target.value)}
                        className="w-full mt-1 bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 uppercase font-bold">Subject Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Operating Systems"
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      required
                      className="w-full mt-1 bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 uppercase font-bold">Class Timing</label>
                    <input
                      type="text"
                      placeholder="e.g. 09:00 AM - 10:00 AM"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      required
                      className="w-full mt-1 bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-2 py-2.5 text-xs font-bold uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition cursor-pointer"
                  >
                    + Add to {newDay}
                  </button>
                </form>

                {/* SAVED PERIODS LIST */}
                <div>
                  <h4 className="text-xs uppercase font-bold text-zinc-400 tracking-wider mb-3">
                    All Saved Periods ({timetable.length})
                  </h4>
                  {timetable.length === 0 ? (
                    <p className="text-xs text-zinc-500">No classes saved yet. Upload a photo above to populate!</p>
                  ) : (
                    <div className="space-y-2">
                      {timetable.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs"
                        >
                          <div>
                            <span className="font-bold text-white">{p.subject}</span>
                            <div className="text-zinc-400 text-[11px] mt-0.5">
                              {p.day} • {p.time} {p.room && `• Room ${p.room}`}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeletePeriod(p.id)}
                            className="text-red-400 hover:text-red-300 font-bold px-2 py-1 cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-zinc-800 flex justify-end">
                <button
                  onClick={() => setIsSetupOpen(false)}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-white text-black rounded-lg hover:bg-zinc-200 font-bold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

