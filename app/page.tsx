'use client';

import { useState, useEffect, useRef } from 'react';

// Data types
interface Period {
  id: string;
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
  subject: string;
  time: string;
  room?: string;
}

interface SubjectAttendance {
  attended: number;
  total: number;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function normalizeDay(day?: string): Period['day'] | null {
  if (!day || typeof day !== 'string') return null;
  const d = day.trim().toLowerCase();
  if (d.includes('mon')) return 'Monday';
  if (d.includes('tue')) return 'Tuesday';
  if (d.includes('wed')) return 'Wednesday';
  if (d.includes('thu')) return 'Thursday';
  if (d.includes('fri')) return 'Friday';
  if (d.includes('sat')) return 'Saturday';
  return null;
}

// Client-side image processor: compresses phone camera photos to lightweight JPEG (<300KB)
async function processImageForUpload(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 1600;
          let width = img.width || 1200;
          let height = img.height || 800;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            const raw = (e.target?.result as string).split(',')[1];
            return resolve({ base64: raw, mimeType: file.type || 'image/jpeg' });
          }

          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          const base64 = dataUrl.split(',')[1];
          resolve({ base64, mimeType: 'image/jpeg' });
        } catch {
          const raw = (e.target?.result as string).split(',')[1];
          resolve({ base64: raw, mimeType: file.type || 'image/jpeg' });
        }
      };
      img.onerror = () => {
        const raw = (e.target?.result as string).split(',')[1];
        resolve({ base64: raw, mimeType: file.type || 'image/jpeg' });
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Timetable State
  const [timetable, setTimetable] = useState<Period[]>([]);
  const [attendance, setAttendance] = useState<Record<string, SubjectAttendance>>({});
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [editAttended, setEditAttended] = useState<number>(0);
  const [editTotal, setEditTotal] = useState<number>(0);

  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);

  // Form state for manual add
  const [newDay, setNewDay] = useState<Period['day']>('Monday');
  const [newSubject, setNewSubject] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newRoom, setNewRoom] = useState('');

  // Load saved timetable & attendance safely on client after mount
  useEffect(() => {
    try {
      const savedTimetable = window.localStorage.getItem('pyramids_timetable');
      if (savedTimetable) {
        const parsed = JSON.parse(savedTimetable);
        if (Array.isArray(parsed)) {
          const cleaned: Period[] = parsed
            .filter((p) => p && typeof p === 'object' && p.subject)
            .map((p, i) => ({
              id: p.id || `period-${Date.now()}-${i}`,
              day: normalizeDay(p.day) || 'Monday',
              subject: String(p.subject || '').trim(),
              time: String(p.time || 'Scheduled').trim(),
              room: p.room ? String(p.room).trim() : undefined,
            }))
            .filter((p) => p.subject.length > 0);
          setTimetable(cleaned);
        }
      }
    } catch (e) {
      console.error('Error loading timetable from storage:', e);
    }

    try {
      const savedAttendance = window.localStorage.getItem('pyramids_attendance');
      if (savedAttendance) {
        const parsed = JSON.parse(savedAttendance);
        if (parsed && typeof parsed === 'object') {
          setAttendance(parsed);
        }
      } else {
        const savedBunks = window.localStorage.getItem('pyramids_bunks');
        if (savedBunks) {
          const oldBunks = JSON.parse(savedBunks) as Record<string, number>;
          const migrated: Record<string, SubjectAttendance> = {};
          Object.keys(oldBunks).forEach((sub) => {
            const bunksCount = oldBunks[sub] || 0;
            migrated[sub] = { attended: Math.max(0, 10 - bunksCount), total: 10 };
          });
          setAttendance(migrated);
        }
      }
    } catch (e) {
      console.error('Error loading attendance from storage:', e);
    }
  }, []);

  function saveTimetable(updated: Period[]) {
    setTimetable(updated);
    try {
      window.localStorage.setItem('pyramids_timetable', JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving timetable:', e);
    }
  }

  function saveAttendance(updated: Record<string, SubjectAttendance>) {
    setAttendance(updated);
    try {
      window.localStorage.setItem('pyramids_attendance', JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving attendance:', e);
    }
  }

  // Attendance Actions
  function markPresent(subject: string) {
    const current = attendance[subject] || { attended: 0, total: 0 };
    const safeAttended = typeof current.attended === 'number' ? current.attended : 0;
    const safeTotal = typeof current.total === 'number' ? current.total : 0;
    const updated = {
      ...attendance,
      [subject]: {
        attended: safeAttended + 1,
        total: safeTotal + 1,
      },
    };
    saveAttendance(updated);
  }

  function markBunk(subject: string) {
    const current = attendance[subject] || { attended: 0, total: 0 };
    const safeAttended = typeof current.attended === 'number' ? current.attended : 0;
    const safeTotal = typeof current.total === 'number' ? current.total : 0;
    const updated = {
      ...attendance,
      [subject]: {
        attended: safeAttended,
        total: safeTotal + 1,
      },
    };
    saveAttendance(updated);
  }

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSubject) return;
    const safeTotal = Math.max(0, editTotal);
    const safeAttended = Math.min(safeTotal, Math.max(0, editAttended));
    const updated = {
      ...attendance,
      [editingSubject]: {
        attended: safeAttended,
        total: safeTotal,
      },
    };
    saveAttendance(updated);
    setEditingSubject(null);
  }

  // Attendance Math
  function getAttendanceMetrics(attendedRaw: any, totalRaw: any) {
    const attended = Math.max(0, parseInt(attendedRaw, 10) || 0);
    const total = Math.max(0, parseInt(totalRaw, 10) || 0);

    if (total === 0) {
      return {
        percentage: 100,
        isSafe: true,
        safeBunks: 0,
        neededToAttend: 0,
      };
    }

    const percentage = Math.round((attended / total) * 100);
    const isSafe = percentage >= 75;

    // Safe bunks formula: attended / (total + x) >= 0.75 => x <= (4*attended - 3*total)/3
    const safeBunks = Math.max(0, Math.floor((4 * attended - 3 * total) / 3));

    // Needed to reach 75%: (attended + x) / (total + x) >= 0.75 => x >= 3*total - 4*attended
    const neededToAttend = Math.max(1, 3 * total - 4 * attended);

    return { percentage, isSafe, safeBunks, neededToAttend };
  }

  // Extract unique subjects strictly from the uploaded/configured timetable
  const uniqueSubjects = Array.from(
    new Set(
      timetable
        .filter((p) => p && typeof p.subject === 'string' && p.subject.trim().length > 0)
        .map((p) => p.subject.trim())
    )
  );

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
    setScanSuccess(`Added to ${newDay}`);
    setTimeout(() => setScanSuccess(null), 2500);
  }

  function handleDeletePeriod(id: string) {
    saveTimetable(timetable.filter((p) => p.id !== id));
  }

  function handleClearAllTimetable() {
    if (confirm('Clear all periods from your timetable?')) {
      saveTimetable([]);
    }
  }

  // AI Photo Scanning Handler with Mobile Camera Compression
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanError(null);
    setScanSuccess(null);
    setScanStatus('Optimizing image for scan...');

    try {
      const { base64, mimeType } = await processImageForUpload(file);
      setScanStatus('Scanning timetable with Gemini AI...');

      const res = await fetch('/api/scan-timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: mimeType,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to scan timetable');

      if (Array.isArray(data.periods) && data.periods.length > 0) {
        const formatted: Period[] = data.periods
          .map((p: any, i: number) => {
            const validDay = normalizeDay(p.day);
            if (!validDay || !p.subject || typeof p.subject !== 'string' || !p.subject.trim()) return null;
            return {
              id: `${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
              day: validDay,
              subject: p.subject.trim(),
              time: (p.time && typeof p.time === 'string' && p.time.trim()) || 'Scheduled',
              room: (p.room && typeof p.room === 'string' && p.room.trim()) || undefined,
            };
          })
          .filter(Boolean) as Period[];

        if (formatted.length === 0) {
          throw new Error('Could not identify class periods. Please check image clarity or add manually below.');
        }

        saveTimetable([...timetable, ...formatted]);
        setScanSuccess(`Scanned ${formatted.length} classes into your schedule.`);
        setTimeout(() => {
          setIsSetupOpen(false);
          setScanSuccess(null);
        }, 1500);
      } else {
        throw new Error('No class periods found in image. Try adding them manually below.');
      }
    } catch (err: any) {
      setScanError(err.message || 'Error processing image');
    } finally {
      setIsScanning(false);
      setScanStatus(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  // Today's Date Info
  const todayIndex = new Date().getDay();
  const todayName = DAYS[todayIndex];
  const todaysClasses = timetable.filter((p) => p.day === todayName);

  return (
    <main className="min-h-screen bg-black text-white p-4 sm:p-12">
      <div className="max-w-4xl mx-auto space-y-10 sm:space-y-12">
        {/* ================= HEADER ================= */}
        <header className="border-b border-zinc-800 pb-5 sm:pb-6 flex justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-orange-500">Pyramids</h1>
            <p className="text-zinc-400 text-xs sm:text-sm mt-1">College Life &amp; Academic OS</p>
          </div>
          <button
            type="button"
            onClick={() => setIsSetupOpen(true)}
            className="flex-shrink-0 flex items-center justify-center bg-white text-black hover:bg-zinc-200 border border-white text-xs font-bold uppercase tracking-wider py-2.5 px-4 rounded-xl transition active:scale-95 cursor-pointer touch-manipulation shadow-sm select-none"
          >
            Setup Timetable
          </button>
        </header>

        {/* ================= SECTION 1: TODAY'S SCHEDULE ================= */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold">
                Daily Schedule
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-white mt-0.5">
                Today&apos;s Classes — {todayName}
              </h2>
            </div>
            <span className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-400 px-3 py-1 rounded-full">
              {todaysClasses.length} {todaysClasses.length === 1 ? 'class' : 'classes'} scheduled
            </span>
          </div>

          {todayName === 'Sunday' ? (
            <div className="p-8 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/50">
              <p className="text-lg font-semibold text-zinc-300">It&apos;s Sunday. No classes today.</p>
              <p className="text-sm text-zinc-500 mt-1">Rest up or catch up on your personal projects.</p>
            </div>
          ) : todaysClasses.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/50">
              <p className="text-base sm:text-lg font-semibold text-zinc-300">
                No classes configured for {todayName} yet.
              </p>
              <button
                type="button"
                onClick={() => {
                  setNewDay(todayName as Period['day']);
                  setIsSetupOpen(true);
                }}
                className="mt-4 text-xs uppercase font-bold tracking-wider text-black bg-white px-5 py-3 rounded-xl hover:bg-zinc-200 active:scale-95 transition cursor-pointer touch-manipulation select-none"
              >
                + Setup Timetable
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {todaysClasses.map((item, idx) => (
                <div
                  key={item.id}
                  className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-3 transition"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <span className="w-8 h-8 flex-shrink-0 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm sm:text-lg text-white truncate">{item.subject}</h3>
                      <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5">
                        <span className="text-zinc-300">{item.time}</span>
                        {item.room && <span>• Room {item.room}</span>}
                      </div>
                    </div>
                  </div>
                  <span className="flex-shrink-0 text-[11px] bg-zinc-900 text-zinc-400 border border-zinc-800 px-2.5 py-1 rounded-lg">
                    Scheduled
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ================= SECTION 2: 75% ATTENDANCE GUARD ================= */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div>
              <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold">
                Academic Safety
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-0.5">
                75% Attendance Guard
              </h2>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-widest bg-zinc-950 border border-zinc-800 text-zinc-400 px-3.5 py-1.5 rounded-full">
              Real-Time Tracker
            </span>
          </div>

          {uniqueSubjects.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/50">
              <p className="text-base font-semibold text-zinc-300">No subjects found yet.</p>
              <p className="text-xs text-zinc-500 mt-1">
                Upload your timetable photo or add classes in Setup above to track your attendance.
              </p>
              <button
                type="button"
                onClick={() => setIsSetupOpen(true)}
                className="mt-4 text-xs uppercase font-bold tracking-wider text-black bg-white px-4 py-2.5 rounded-xl hover:bg-zinc-200 transition cursor-pointer touch-manipulation select-none"
              >
                + Setup Timetable
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {uniqueSubjects.map((subjectName) => {
                const record = attendance[subjectName] || { attended: 0, total: 0 };
                const { percentage, isSafe, safeBunks, neededToAttend } = getAttendanceMetrics(
                  record.attended,
                  record.total
                );

                return (
                  <div
                    key={subjectName}
                    className="bg-[#09090b] border border-zinc-800/80 rounded-2xl p-5 sm:p-6 flex flex-col justify-between hover:border-zinc-700/80 transition"
                  >
                    <div>
                      {/* Top Row: Subject Title & Settings/Edit */}
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-base sm:text-lg text-white tracking-tight leading-snug">
                          {subjectName}
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSubject(subjectName);
                            setEditAttended(record.attended);
                            setEditTotal(record.total);
                          }}
                          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition py-1 px-2 rounded bg-zinc-900 border border-zinc-800 cursor-pointer touch-manipulation"
                          title="Adjust Attendance Numbers"
                        >
                          Edit
                        </button>
                      </div>

                      {/* Percentage & Fraction */}
                      <div className="flex items-baseline gap-2 mt-3 mb-4">
                        <span
                          className={`text-3xl font-extrabold tracking-tight ${
                            record.total === 0
                              ? 'text-white'
                              : isSafe
                              ? 'text-white'
                              : 'text-[#f87171]'
                          }`}
                        >
                          {record.total === 0 ? '100%' : `${percentage}%`}
                        </span>
                        <span className="text-xs text-zinc-400 font-medium">
                          ({record.attended}/{record.total} attended)
                        </span>
                      </div>

                      {/* Safe / Warning Banner */}
                      {record.total === 0 ? (
                        <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl px-4 py-2.5 text-xs text-zinc-400 font-medium mb-5">
                          No classes logged yet. Tap Present or Bunk below to start.
                        </div>
                      ) : isSafe ? (
                        <div className="bg-[#121214] border border-zinc-800/80 rounded-xl px-4 py-2.5 text-xs text-zinc-300 font-medium mb-5">
                          {safeBunks > 0
                            ? `Can safely bunk ${safeBunks} more ${safeBunks === 1 ? 'class' : 'classes'}`
                            : 'On the threshold. Bunking 1 class will drop below 75%'}
                        </div>
                      ) : (
                        <div className="bg-[#1e0a0a] border border-red-950/80 rounded-xl px-4 py-2.5 text-xs text-[#f87171] font-medium mb-5">
                          Need to attend next {neededToAttend} {neededToAttend === 1 ? 'class' : 'classes'} to hit 75%
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => markPresent(subjectName)}
                        className="flex-1 py-3 px-4 bg-white text-black text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-zinc-200 active:scale-95 transition text-center cursor-pointer shadow-sm touch-manipulation select-none"
                      >
                        Present +1
                      </button>
                      <button
                        type="button"
                        onClick={() => markBunk(subjectName)}
                        className="flex-1 py-3 px-4 bg-[#141417] hover:bg-zinc-800 border border-zinc-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl active:scale-95 transition text-center cursor-pointer touch-manipulation select-none"
                      >
                        Bunk +1
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ================= EDIT ATTENDANCE MODAL ================= */}
        {editingSubject && (
          <div
            className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setEditingSubject(null);
            }}
          >
            <div
              className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-bold text-white">Adjust Numbers</h3>
                <button
                  type="button"
                  onClick={() => setEditingSubject(null)}
                  className="w-8 h-8 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer touch-manipulation"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-zinc-400 mb-4 font-medium leading-relaxed">
                {editingSubject}
              </p>

              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div>
                  <label className="text-[11px] text-zinc-400 uppercase font-bold tracking-wider">
                    Classes Attended
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editAttended}
                    onChange={(e) => setEditAttended(parseInt(e.target.value) || 0)}
                    className="w-full mt-1 bg-black border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 uppercase font-bold tracking-wider">
                    Total Classes Held
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editTotal}
                    onChange={(e) => setEditTotal(parseInt(e.target.value) || 0)}
                    className="w-full mt-1 bg-black border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingSubject(null)}
                    className="flex-1 py-2.5 text-xs font-bold uppercase rounded-xl bg-zinc-900 text-zinc-400 hover:bg-zinc-800 cursor-pointer touch-manipulation"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 text-xs font-bold uppercase rounded-xl bg-white text-black hover:bg-zinc-200 cursor-pointer touch-manipulation"
                  >
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= SETUP TIMETABLE MODAL ================= */}
        {isSetupOpen && (
          <div
            className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsSetupOpen(false);
            }}
          >
            <div
              className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-zinc-800 flex justify-between items-center flex-shrink-0 bg-zinc-950">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">Configure Timetable</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Upload photo or enter periods manually</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSetupOpen(false)}
                  className="w-9 h-9 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer border border-zinc-800 touch-manipulation text-base"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 sm:p-5 overflow-y-auto space-y-6">
                {/* AI PHOTO SCANNER CARD */}
                <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-700/80 rounded-2xl p-5 text-center">
                  <h4 className="text-sm font-bold text-white">Auto-Scan with AI</h4>
                  <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                    Upload a photo or screenshot from your camera or gallery. Gemini AI extracts all periods and subjects.
                  </p>

                  {/* Hidden standard file input referenced by ref */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    disabled={isScanning}
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />

                  {/* Accessible touch button that triggers file picker on any mobile OS */}
                  <button
                    type="button"
                    disabled={isScanning}
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 px-5 py-3 bg-white text-black font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-zinc-200 active:scale-95 transition inline-flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50 touch-manipulation select-none"
                  >
                    {isScanning ? (scanStatus || 'Processing...') : 'Choose Timetable Photo'}
                  </button>

                  {isScanning && (
                    <div className="mt-3 flex items-center justify-center gap-2 text-xs text-zinc-300 animate-pulse font-medium">
                      <span>{scanStatus}</span>
                    </div>
                  )}

                  {scanSuccess && (
                    <p className="text-xs text-emerald-400 mt-3 font-semibold bg-emerald-950/30 border border-emerald-900/60 p-2.5 rounded-xl">
                      {scanSuccess}
                    </p>
                  )}

                  {scanError && (
                    <p className="text-xs text-red-400 mt-3 font-semibold bg-red-950/30 border border-red-900/60 p-2.5 rounded-xl">
                      Error: {scanError}
                    </p>
                  )}
                </div>

                {/* MANUAL ADD FORM */}
                <form onSubmit={handleAddPeriod} className="bg-zinc-900/60 p-4 sm:p-5 rounded-2xl border border-zinc-800 space-y-3.5">
                  <h4 className="text-xs uppercase font-bold text-zinc-400 tracking-wider">Or Add Period Manually</h4>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] text-zinc-400 uppercase font-bold">Day</label>
                      <select
                        value={newDay}
                        onChange={(e) => setNewDay(e.target.value as Period['day'])}
                        className="w-full mt-1 bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-zinc-600"
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
                        placeholder="e.g. Room A 403"
                        value={newRoom}
                        onChange={(e) => setNewRoom(e.target.value)}
                        className="w-full mt-1 bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-zinc-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 uppercase font-bold">Subject Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Calculus and Linear Algebra"
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      required
                      className="w-full mt-1 bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-zinc-600"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 uppercase font-bold">Class Timing</label>
                    <input
                      type="text"
                      placeholder="e.g. 09:00 AM - 09:55 AM"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      required
                      className="w-full mt-1 bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-zinc-600"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-2 py-3 text-xs font-bold uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition active:scale-95 cursor-pointer touch-manipulation"
                  >
                    + Add to {newDay}
                  </button>
                </form>

                {/* SAVED PERIODS LIST */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs uppercase font-bold text-zinc-400 tracking-wider">
                      Saved Periods ({timetable.length})
                    </h4>
                    {timetable.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllTimetable}
                        className="text-[11px] text-red-400 hover:text-red-300 uppercase font-bold tracking-wider cursor-pointer touch-manipulation"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {timetable.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-3">No classes saved yet. Upload a photo or add periods above.</p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {timetable.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs gap-2"
                        >
                          <div className="min-w-0">
                            <span className="font-bold text-white truncate block">{p.subject}</span>
                            <div className="text-zinc-400 text-[11px] mt-0.5">
                              {p.day} • {p.time} {p.room && `• ${p.room}`}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeletePeriod(p.id)}
                            className="text-red-400 hover:text-red-300 font-bold px-2 py-1 cursor-pointer flex-shrink-0 touch-manipulation"
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
              <div className="p-4 border-t border-zinc-800 flex justify-end flex-shrink-0 bg-zinc-950">
                <button
                  type="button"
                  onClick={() => setIsSetupOpen(false)}
                  className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider bg-white text-black rounded-xl hover:bg-zinc-200 cursor-pointer touch-manipulation"
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
