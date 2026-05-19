import React, { useState } from 'react';
import { Users, UserMinus, CalendarCheck, ClipboardList, CheckCircle2, AlertCircle, RefreshCw, Upload, FileSpreadsheet, Zap, Printer } from 'lucide-react';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Utility: Free Period Check
const isPeriodFree = (val) => {
  if (!val) return true;
  const v = val.trim().toLowerCase();
  return ['free', 'nil', '-', 'f', ''].includes(v);
};

// Utility: Extract Grade from Class Name (e.g., '10B' -> '10', 'KG1A' -> 'KG1')
const extractGrade = (className) => {
  if (!className) return null;
  const match = className.match(/(KG[12]|\d+)/i);
  return match ? match[0].toUpperCase() : null;
};

// Utility: Extract multiple grades from "Classes Handled" column
const extractAllGrades = (gradesStr) => {
  if (!gradesStr) return [];
  const matches = gradesStr.match(/(KG[12]|\d+)/gi);
  return matches ? [...new Set(matches.map(m => m.toUpperCase()))] : [];
};

// Utility: Get Category
const getCategory = (grade) => {
  if (!grade) return 99; // Unknown
  if (grade.startsWith('KG')) return 0; // KG
  const num = parseInt(grade);
  if (num >= 1 && num <= 2) return 1; // 1-2
  if (num >= 3 && num <= 5) return 2; // 3-5
  if (num >= 6 && num <= 8) return 3; // 6-8
  if (num >= 9 && num <= 10) return 4; // 9-10
  if (num >= 11 && num <= 12) return 5; // 11-12
  return 99;
};

// Utility: Special Teachers
const isSpecialTeacher = (subject) => {
  if (!subject) return false;
  const sub = subject.toLowerCase();
  return sub.includes('physical education') || sub.includes('pe') || 
         sub.includes('art') || sub.includes('dance') || 
         sub.includes('library') || sub.includes('robotics');
};

export default function App() {
  const [activeTab, setActiveTab] = useState('upload'); 
  const [teachers, setTeachers] = useState([]);
  const [selectedDay, setSelectedDay] = useState(DAYS[new Date().getDay() - 1] || 'Monday');
  const [absentTeachers, setAbsentTeachers] = useState([]);
  const [substitutions, setSubstitutions] = useState({}); // `${absentId}_${periodIndex}`: subId

  // Parse CSV Data (Handles commas inside quotes)
  const parseCSV = (text) => {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') inQuotes = !inQuotes;
      else if (c === ',' && !inQuotes) { currentRow.push(currentCell.trim()); currentCell = ''; }
      else if (c === '\n' && !inQuotes) { currentRow.push(currentCell.trim()); rows.push(currentRow); currentRow = []; currentCell = ''; }
      else currentCell += c;
    }
    if (currentRow.length > 0) rows.push(currentRow);
    return rows;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const parsedData = parseCSV(text);
      // Skip header, filter empty rows
      const dataRows = parsedData.slice(1).filter(r => r.length > 10);
      
      const parsedTeachers = dataRows.map((r, index) => {
        // Col 2: Name, Col 3: Subject, Col 4: Classes Handled, Col 5-64: Timetable
        return {
          id: index + 1,
          name: r[2] || `Teacher ${index + 1}`,
          subject: r[3] || '-',
          handledGrades: extractAllGrades(r[4] || ''),
          timetable: {
            Monday: r.slice(5, 15), Tuesday: r.slice(15, 25), Wednesday: r.slice(25, 35),
            Thursday: r.slice(35, 45), Friday: r.slice(45, 55), Saturday: r.slice(55, 65)
          }
        };
      });
      setTeachers(parsedTeachers);
      setAbsentTeachers([]);
      setSubstitutions({});
      setActiveTab('leave');
      alert(`Success! ${parsedTeachers.length} teachers loaded from CSV.`);
    };
    reader.readAsText(file);
  };

  const toggleAbsence = (teacherId) => {
    setAbsentTeachers(prev => {
      if (prev.includes(teacherId)) {
        const newSubs = { ...substitutions };
        Object.keys(newSubs).forEach(key => { if (key.startsWith(`${teacherId}_`)) delete newSubs[key]; });
        setSubstitutions(newSubs);
        return prev.filter(id => id !== teacherId);
      } else {
        return [...prev, teacherId];
      }
    });
  };

  // CORE ENGINE: Calculate Priority (P1 to P7)
  const calculatePriority = (sub, targetClass, absentSubject) => {
    const targetGrade = extractGrade(targetClass);
    const targetCategory = getCategory(targetGrade);
    
    const handlesExactGrade = sub.handledGrades.includes(targetGrade);
    const isSameSubject = sub.subject.toLowerCase() === absentSubject.toLowerCase();
    const handlesSameCategory = sub.handledGrades.some(g => getCategory(g) === targetCategory);

    if (handlesExactGrade && isSameSubject) return { code: 'P1', score: 1, desc: 'Same Subject + Same Grade' };
    if (handlesExactGrade) return { code: 'P2', score: 2, desc: 'Same Exact Grade' };
    if (handlesSameCategory && isSameSubject) return { code: 'P3', score: 3, desc: 'Same Subject + Same Category' };
    if (handlesSameCategory) return { code: 'P4', score: 4, desc: 'Same Category' };
    if (isSpecialTeacher(sub.subject)) return { code: 'P5', score: 5, desc: 'Special Teacher' };
    
    // Nearby Category (difference of 1)
    const isNearbyCategory = sub.handledGrades.some(g => Math.abs(getCategory(g) - targetCategory) === 1);
    if (isNearbyCategory) return { code: 'P6', score: 6, desc: 'Nearby Category' };

    return { code: 'P7', score: 7, desc: 'Any Available' };
  };

  // Get current loads for all teachers today
  const getTeacherLoads = (tempSubstitutions = substitutions) => {
    const loads = {};
    Object.values(tempSubstitutions).forEach(subId => {
      if (subId) loads[subId] = (loads[subId] || 0) + 1;
    });
    return loads;
  };

  // Get available substitutes for a period, ranked by priority
  const getRankedSubstitutes = (periodIndex, targetClass, absentSubject, tempSubs = substitutions) => {
    const currentLoads = getTeacherLoads(tempSubs);
    
    let available = teachers.filter(t => {
      if (absentTeachers.includes(t.id)) return false; // Absent
      if (!isPeriodFree(t.timetable[selectedDay]?.[periodIndex])) return false; // Not free
      
      // Check if already assigned in this EXACT period
      const isAlreadyAssignedThisPeriod = Object.entries(tempSubs).some(([key, subId]) => {
        const [_, pIdx] = key.split('_');
        return Number(pIdx) === periodIndex && subId === t.id;
      });
      if (isAlreadyAssignedThisPeriod) return false;

      // Load Balancing (Max 2 ever)
      if ((currentLoads[t.id] || 0) >= 2) return false;

      return true;
    });

    // Calculate priority and sort
    return available.map(t => {
      const priority = calculatePriority(t, targetClass, absentSubject);
      const load = currentLoads[t.id] || 0;
      return { teacher: t, priority, load };
    }).sort((a, b) => {
      // First sort by load (Prefer teachers with 0 subs today over 1)
      if (a.load !== b.load) return a.load - b.load;
      // Then sort by priority score (1 is best)
      return a.priority.score - b.priority.score;
    });
  };

  // AUTO-ASSIGN ENGINE
  const runAutoEngine = () => {
    if (absentTeachers.length === 0) {
      alert("Please mark absentees first before running the engine.");
      return;
    }

    let newSubs = { ...substitutions };
    let assignmentsMade = 0;

    absentTeachers.forEach(absentId => {
      const teacher = teachers.find(t => t.id === absentId);
      const todaysPeriods = teacher.timetable[selectedDay] || [];
      
      todaysPeriods.forEach((cls, idx) => {
        // Skip if free period or already manually assigned
        if (isPeriodFree(cls) || newSubs[`${absentId}_${idx}`]) return;

        // Find best substitute (pass temp state to recalculate loads accurately)
        const ranked = getRankedSubstitutes(idx, cls, teacher.subject, newSubs);
        
        // Strict filter: Try to find someone with Load 0 first
        let best = ranked.find(r => r.load === 0);
        
        // If no one with Load 0, allow Load 1 (Forced Max 2)
        if (!best && ranked.length > 0) {
          best = ranked[0]; 
        }

        if (best) {
          newSubs[`${absentId}_${idx}`] = best.teacher.id;
          assignmentsMade++;
        }
      });
    });

    setSubstitutions(newSubs);
    alert(`Smart Engine executed successfully!\nAssigned ${assignmentsMade} substitutions based on P1-P7 rules.`);
  };

  const handleAssignSubstitute = (absentId, periodIndex, subId) => {
    setSubstitutions(prev => ({
      ...prev,
      [`${absentId}_${periodIndex}`]: subId ? Number(subId) : ""
    }));
  };

  const resetAll = () => {
      if(window.confirm("Are you sure you want to clear today's absentees and assignments?")) {
        setAbsentTeachers([]);
        setSubstitutions({});
      }
    };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-24">
      {/* Header */}
      <header className="bg-indigo-800 text-white p-4 shadow-md sticky top-0 z-20 print:hidden">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CalendarCheck className="w-8 h-8 text-indigo-200" />
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-wide">SUGUNA PIPS Substitution</h1>
              <p className="text-xs text-indigo-300">Smart Engine v2.0</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-indigo-900 p-1.5 rounded-lg border border-indigo-700">
              <span className="text-sm font-medium pl-2 text-indigo-200">Day:</span>
              <select 
                value={selectedDay} 
                onChange={(e) => {
                  if(window.confirm("Changing the day will clear current assignments. Continue?")) {
                    setSelectedDay(e.target.value);
                    setAbsentTeachers([]);
                    setSubstitutions({});
                  }
                }}
                className="bg-indigo-800 text-white text-sm rounded px-2 py-1 outline-none cursor-pointer border-none font-bold"
              >
                {DAYS.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>
            <button onClick={resetAll} className="p-2 hover:bg-indigo-700 rounded-full transition-colors text-indigo-200 hover:text-white" title="Reset All Data">
                <RefreshCw className="w-5 h-5"/>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 mt-4">
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap bg-white rounded-xl shadow-sm p-1 mb-6 border border-slate-200 print:hidden">
          {['upload', 'leave', 'assign', 'summary'].map((tab) => {
            const icons = { upload: Upload, leave: UserMinus, assign: Users, summary: ClipboardList };
            const labels = { upload: '1. Data Upload', leave: '2. Mark Leave', assign: '3. Auto Assign', summary: '4. Report' };
            const Icon = icons[tab];
            const isActive = activeTab === tab;
            const isDisabled = tab !== 'upload' && teachers.length === 0;

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                disabled={isDisabled}
                className={`flex-1 py-3 px-2 min-w-[100px] flex flex-col items-center justify-center gap-2 rounded-lg font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  isActive ? 'bg-indigo-100 text-indigo-800 shadow-sm border border-indigo-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-600' : ''}`} />
                <span>{labels[tab]}</span>
                {tab === 'assign' && absentTeachers.length > 0 && (
                  <span className="absolute top-2 right-2 md:relative md:top-auto md:right-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full mt-1">
                    {absentTeachers.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div>
          {/* TAB 1: CSV UPLOAD */}
          {activeTab === 'upload' && (
            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center max-w-2xl mx-auto">
              <FileSpreadsheet className="w-16 h-16 text-indigo-300 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2 text-slate-800">Master Data Upload</h2>
              <p className="text-slate-500 mb-8 leading-relaxed text-sm">
                Upload the "Staff Info & Timetable Collection" CSV here. The Smart Engine will extract Subjects, Grades handled, and Timetables automatically to map the P1-P7 rules.
              </p>
              
              <label className="inline-flex items-center justify-center px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer font-medium transition-colors shadow-sm">
                <Upload className="w-5 h-5 mr-2" />
                Upload CSV File
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>

              {teachers.length > 0 && (
                <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 font-medium">
                  <CheckCircle2 className="w-6 h-6 inline-block mr-2" />
                  Success! {teachers.length} Teachers parsed. Engine is ready.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LEAVE MANAGEMENT */}
          {activeTab === 'leave' && (
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Mark Absentees</h2>
                  <p className="text-sm text-slate-500">Select teachers on leave for {selectedDay}</p>
                </div>
                <span className="text-sm bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-bold border border-indigo-100">
                  Total Staff: {teachers.length}
                </span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {teachers.map(teacher => {
                  const isAbsent = absentTeachers.includes(teacher.id);
                  return (
                    <div 
                      key={teacher.id} 
                      onClick={() => toggleAbsence(teacher.id)}
                      className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                        isAbsent 
                          ? 'border-red-400 bg-red-50 shadow-sm' 
                          : 'border-slate-100 bg-white hover:border-indigo-300 hover:bg-indigo-50/50'
                      }`}
                    >
                      <div className="overflow-hidden w-[80%]">
                        <p className={`font-bold truncate ${isAbsent ? 'text-red-800' : 'text-slate-700'}`} title={teacher.name}>{teacher.name}</p>
                        <p className="text-xs text-slate-500 truncate" title={teacher.subject}>{teacher.subject}</p>
                      </div>
                      <div className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ml-2 ${
                        isAbsent ? 'border-red-500 bg-red-500' : 'border-slate-300'
                      }`}>
                        {isAbsent && <CheckCircle2 className="w-4 h-4 text-white" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: ASSIGN SUBSTITUTES */}
          {activeTab === 'assign' && (
            <div className="space-y-6">
              
              {/* Smart Engine Action Bar */}
              {absentTeachers.length > 0 && (
                <div className="bg-indigo-900 rounded-xl p-5 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="text-white">
                    <h3 className="font-bold text-lg flex items-center gap-2"><Zap className="text-yellow-400 fill-yellow-400" /> Smart Engine Ready</h3>
                    <p className="text-indigo-200 text-sm">Follows strict Grade Matching & Load Balancing</p>
                  </div>
                  <button 
                    onClick={runAutoEngine}
                    className="w-full md:w-auto bg-yellow-400 hover:bg-yellow-500 text-indigo-900 font-bold py-3 px-6 rounded-lg shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <Zap className="w-5 h-5" /> Run Auto-Assign
                  </button>
                </div>
              )}

              {absentTeachers.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center">
                  <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-slate-700">All Teachers Present!</h3>
                  <p className="text-slate-500 mt-2">No absentees marked for today.</p>
                </div>
              ) : (
                absentTeachers.map(absentId => {
                  const teacher = teachers.find(t => t.id === absentId);
                  if (!teacher) return null;
                  
                  const todaysPeriods = teacher.timetable[selectedDay] || [];
                  const busyPeriods = todaysPeriods.map((cls, idx) => ({ cls, idx })).filter(p => !isPeriodFree(p.cls));

                  return (
                    <div key={absentId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                      <div className="bg-slate-50 border-b border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-lg text-slate-800">{teacher.name}</h3>
                          <p className="text-sm text-slate-500">{teacher.subject} • Handles: {teacher.handledGrades.join(', ') || 'None'}</p>
                        </div>
                        <span className="text-sm px-3 py-1 bg-red-100 text-red-700 border border-red-200 rounded-full font-bold inline-block text-center w-max">On Leave</span>
                      </div>
                      
                      <div className="p-0">
                        {busyPeriods.map(({cls, idx}) => {
                          const rankedSubs = getRankedSubstitutes(idx, cls, teacher.subject, substitutions);
                          const currentSubId = substitutions[`${absentId}_${idx}`];
                          
                          // Find selected sub's priority if assigned
                          let selectedPriorityStr = "";
                          if (currentSubId) {
                            const assignedTeacher = teachers.find(t => t.id === Number(currentSubId));
                            if(assignedTeacher) {
                                const pInfo = calculatePriority(assignedTeacher, cls, teacher.subject);
                                selectedPriorityStr = `[${pInfo.code}]`;
                            }
                          }

                          return (
                            <div key={idx} className="border-b border-slate-100 last:border-0 p-4 flex flex-col md:flex-row md:items-center gap-4 hover:bg-slate-50 transition-colors">
                              <div className="flex items-center gap-4 w-full md:w-1/3">
                                <div className="bg-indigo-100 text-indigo-800 font-black text-lg w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-indigo-200 shadow-inner">
                                  {idx + 1}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-800 text-lg">{cls}</p>
                                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Class</p>
                                </div>
                              </div>
                              
                              <div className="w-full md:w-2/3">
                                <select 
                                  value={currentSubId || ""}
                                  onChange={(e) => handleAssignSubstitute(absentId, idx, e.target.value)}
                                  className={`w-full p-3 rounded-xl border text-sm font-bold outline-none transition-all shadow-sm ${
                                    currentSubId ? 'border-green-400 bg-green-50 text-green-900 focus:ring-2 focus:ring-green-500' : 'border-slate-300 focus:ring-2 focus:ring-indigo-500'
                                  }`}
                                >
                                  <option value="">-- Select Substitute --</option>
                                  
                                  {currentSubId && !rankedSubs.some(r => r.teacher.id === currentSubId) && (
                                     (() => {
                                        const assignedT = teachers.find(t => t.id === Number(currentSubId));
                                        if(!assignedT) return null;
                                        const pCode = calculatePriority(assignedT, cls, teacher.subject).code;
                                        return <option value={assignedT.id}>[{pCode}] {assignedT.name} - {assignedT.subject}</option>
                                     })()
                                  )}

                                  {rankedSubs.map(({teacher: sub, priority, load}) => (
                                    <option key={sub.id} value={sub.id}>
                                      [{priority.code}] {sub.name} - {sub.subject} (Load: {load})
                                    </option>
                                  ))}
                                </select>
                                
                                <div className="mt-2 flex items-center justify-between">
                                  {currentSubId ? (
                                    <p className="text-xs font-bold text-green-600 flex items-center gap-1">
                                      <CheckCircle2 className="w-4 h-4" /> Assigned {selectedPriorityStr}
                                    </p>
                                  ) : rankedSubs.length === 0 ? (
                                    <p className="text-xs font-bold text-red-500 flex items-center gap-1">
                                      <AlertCircle className="w-4 h-4" /> [X] No Substitute Available
                                    </p>
                                  ) : (
                                    <p className="text-xs text-slate-500">{rankedSubs.length} options available</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {busyPeriods.length === 0 && (
                          <div className="p-6 text-center text-slate-500 bg-slate-50 italic">No classes scheduled for today.</div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 4: SUMMARY REPORT (PDF / PRINT VIEW) */}
          {activeTab === 'summary' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8">
              
              <div className="flex justify-between items-center mb-8 print:hidden">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Substitution Report</h2>
                  <p className="text-slate-500">Review and Print PDF</p>
                </div>
                <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 shadow-md transition-all">
                  <Printer className="w-5 h-5" /> Print / Save PDF
                </button>
              </div>

              {/* Strict PDF Format */}
              <div className="hidden print:block text-center mb-8 pb-4 border-b-2 border-slate-800">
                <h1 className="text-3xl font-black text-slate-900 uppercase tracking-widest">SUGUNA PIP SCHOOL</h1>
                <h2 className="text-xl font-bold text-slate-700 mt-2 tracking-widest uppercase">Substitution Report</h2>
                <div className="flex justify-center gap-8 mt-4 text-sm font-bold text-slate-600">
                  <p>DAY: <span className="text-slate-900">{selectedDay}</span></p>
                  <p>DATE: <span className="text-slate-900">{new Date().toLocaleDateString('en-IN')}</span></p>
                </div>
              </div>

              {absentTeachers.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl">
                  <p className="text-lg font-bold text-slate-500">NO ABSENTEES TODAY</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse border-2 border-slate-800">
                    <thead>
                      <tr className="bg-slate-200 text-slate-900 text-sm border-b-2 border-slate-800 uppercase tracking-wider">
                        <th className="p-3 border-r-2 border-slate-800 font-black text-center w-16">Per</th>
                        <th className="p-3 border-r-2 border-slate-800 font-black">Class</th>
                        <th className="p-3 border-r-2 border-slate-800 font-black">Absent Teacher</th>
                        <th className="p-3 font-black bg-indigo-50 border-r-2 border-slate-800">Substitute Teacher</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {absentTeachers.flatMap(absentId => {
                        const teacher = teachers.find(t => t.id === absentId);
                        if(!teacher) return [];
                        const busyPeriods = (teacher.timetable[selectedDay] || []).map((cls, idx) => ({ cls, idx })).filter(p => !isPeriodFree(p.cls));
                        
                        return busyPeriods.map(({cls, idx}) => {
                          const subId = substitutions[`${absentId}_${idx}`];
                          const subTeacher = teachers.find(t => t.id === Number(subId));
                          
                          let priorityCode = "";
                          if (subTeacher) {
                             const pInfo = calculatePriority(subTeacher, cls, teacher.subject);
                             priorityCode = pInfo.code;
                          }

                          return (
                            <tr key={`${absentId}_${idx}`} className="hover:bg-slate-50">
                              <td className="p-3 text-base font-black text-center border-r-2 border-slate-800 bg-slate-50">{idx + 1}</td>
                              <td className="p-3 text-base font-bold text-indigo-900 border-r-2 border-slate-800">{cls}</td>
                              <td className="p-3 text-sm font-semibold text-slate-700 border-r-2 border-slate-800">
                                {teacher.name} <span className="block text-xs text-slate-500 font-normal">{teacher.subject}</span>
                              </td>
                              <td className="p-3 text-sm border-r-2 border-slate-800">
                                {subTeacher ? (
                                  <div>
                                    <span className="font-black text-green-800 text-base">{subTeacher.name}</span>
                                    <span className="ml-2 text-xs font-bold px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded print:hidden">[{priorityCode}]</span>
                                  </div>
                                ) : (
                                  <span className="font-bold text-red-600 uppercase">Not Assigned [X]</span>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              
              <div className="mt-16 pt-8 border-t border-slate-300 flex justify-between px-8 print:flex hidden">
                <div className="text-center">
                  <div className="w-40 border-b border-slate-800 mb-2"></div>
                  <p className="font-bold text-sm text-slate-600">Prepared By</p>
                </div>
                <div className="text-center">
                  <div className="w-40 border-b border-slate-800 mb-2"></div>
                  <p className="font-bold text-sm text-slate-600">Principal Signature</p>
                </div>
              </div>

            </div>
          )}

        </div>
      </main>
    </div>
  );
}