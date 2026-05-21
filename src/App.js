import React, { useState } from 'react';
import { Upload, UserMinus, Zap, ClipboardList, CalendarCheck, CheckCircle2, RefreshCw, FileSpreadsheet, Printer } from 'lucide-react';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function App() {
  const [activeTab, setActiveTab] = useState('upload');
  const [teachers, setTeachers] = useState([]);
  const [selectedDay, setSelectedDay] = useState(DAYS[new Date().getDay() - 1] || 'Monday');
  const [absentTeachers, setAbsentTeachers] = useState([]);
  const [substitutions, setSubstitutions] = useState({});

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
      const dataRows = parsedData.slice(1).filter(r => r.length > 10);
      
      const parsedTeachers = dataRows.map((r, index) => ({
        id: index + 1,
        name: r[2] || `Teacher ${index + 1}`,
        subject: r[3] || '-',
        handledGrades: [],
        timetable: {
          Monday: r.slice(5, 15), Tuesday: r.slice(15, 25), Wednesday: r.slice(25, 35),
          Thursday: r.slice(35, 45), Friday: r.slice(45, 55), Saturday: r.slice(55, 65)
        }
      }));
      setTeachers(parsedTeachers);
      setAbsentTeachers([]);
      setSubstitutions({});
      setActiveTab('leave');
      alert(`Success! ${parsedTeachers.length} teachers loaded.`);
    };
    reader.readAsText(file);
  };

  const toggleAbsence = (teacherId) => {
    setAbsentTeachers(prev => {
      if (prev.includes(teacherId)) {
        return prev.filter(id => id !== teacherId);
      } else {
        return [...prev, teacherId];
      }
    });
  };

  const isPeriodFree = (val) => {
    if (!val) return true;
    const v = val.trim().toLowerCase();
    return ['free', 'nil', '-', 'f', ''].includes(v);
  };

  const getAvailableSubstitutes = (periodIndex) => {
    return teachers.filter(t => {
      if (absentTeachers.includes(t.id)) return false;
      if (!isPeriodFree(t.timetable[selectedDay]?.[periodIndex])) return false;
      return true;
    });
  };

  const handleAssignSubstitute = (absentId, periodIndex, subId) => {
    setSubstitutions(prev => ({ ...prev, [`${absentId}_${periodIndex}`]: subId ? Number(subId) : "" }));
  };

  const resetAll = () => {
    if(window.confirm("Clear all?")) {
      setAbsentTeachers([]);
      setSubstitutions({});
    }
  };

  const tabs = [
    { id: 'upload', label: 'Data Upload', icon: Upload },
    { id: 'leave', label: 'Mark Leave', icon: UserMinus },
    { id: 'assign', label: 'Auto Assign', icon: Zap },
    { id: 'summary', label: 'Report', icon: ClipboardList }
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', paddingBottom: '80px' }}>
      {/* Header */}
      <header style={{ background: 'linear-gradient(90deg, #4f46e5, #9333ea, #db2777)', color: 'white', padding: '12px 16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CalendarCheck size={24} />
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold' }}>SUGUNA PIPS</h1>
              <p style={{ fontSize: '10px', opacity: 0.8 }}>Smart Engine v2.0</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '12px' }}>
              <span style={{ fontSize: '12px' }}>Day:</span>
              <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '8px', padding: '4px 8px', fontSize: '12px' }}>
                {DAYS.map(day => <option key={day} value={day}>{day}</option>)}
              </select>
            </div>
            <button onClick={resetAll} style={{ background: 'rgba(255,255,255,0.2)', padding: '8px', borderRadius: '12px', border: 'none', cursor: 'pointer' }}>
              <RefreshCw size={16} color="white" />
            </button>
          </div>
        </div>
      </header>

      {/* Bottom Navigation */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #e2e8f0', padding: '8px', zIndex: 20, display: 'flex', justifyContent: 'space-around' }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 16px', borderRadius: '12px',
              background: isActive ? 'linear-gradient(90deg, #4f46e5, #9333ea)' : 'transparent',
              color: isActive ? 'white' : '#64748b', border: 'none', cursor: 'pointer'
            }}>
              <Icon size={20} />
              <span style={{ fontSize: '10px', marginTop: '4px' }}>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content */}
      <main style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
            <FileSpreadsheet size={48} color="#06b6d4" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Master Data Upload</h2>
            <p style={{ color: '#64748b', marginBottom: '24px', fontSize: '14px' }}>Upload Staff Info & Timetable Collection CSV</p>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(90deg, #06b6d4, #3b82f6)', color: 'white', padding: '12px 24px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
              <Upload size={16} /> Upload CSV File
              <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            {teachers.length > 0 && (
              <div style={{ marginTop: '16px', padding: '12px', background: '#ecfdf5', borderRadius: '12px', color: '#059669' }}>
                <CheckCircle2 size={16} style={{ display: 'inline', marginRight: '8px' }} /> {teachers.length} Teachers loaded!
              </div>
            )}
          </div>
        )}

        {/* Leave Tab */}
        {activeTab === 'leave' && (
          <div style={{ background: 'white', borderRadius: '16px', padding: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Mark Absentees</h2>
              <span style={{ background: '#fff7ed', color: '#ea580c', padding: '4px 12px', borderRadius: '20px', fontSize: '12px' }}>Total: {teachers.length}</span>
            </div>
            <div style={{ display: 'grid', gap: '8px', maxHeight: '60vh', overflowY: 'auto' }}>
              {teachers.map(teacher => {
                const isAbsent = absentTeachers.includes(teacher.id);
                return (
                  <div key={teacher.id} onClick={() => toggleAbsence(teacher.id)} style={{
                    padding: '12px', borderRadius: '12px', border: '2px solid', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderColor: isAbsent ? '#f87171' : '#e2e8f0', background: isAbsent ? '#fef2f2' : 'white'
                  }}>
                    <p style={{ fontWeight: 'bold', color: isAbsent ? '#991b1b' : '#1e293b' }}>{teacher.name}</p>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid', borderColor: isAbsent ? '#ef4444' : '#cbd5e1', background: isAbsent ? '#ef4444' : 'transparent' }}>
                      {isAbsent && <CheckCircle2 size={16} color="white" style={{ margin: '2px' }} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Assign Tab */}
        {activeTab === 'assign' && (
          <div>
            {absentTeachers.length === 0 ? (
              <div style={{ background: 'white', borderRadius: '16px', padding: '40px', textAlign: 'center' }}>
                <CheckCircle2 size={48} color="#22c55e" style={{ margin: '0 auto 16px' }} />
                <h3>All Teachers Present!</h3>
              </div>
            ) : (
              absentTeachers.map(absentId => {
                const teacher = teachers.find(t => t.id === absentId);
                if (!teacher) return null;
                const periods = teacher.timetable[selectedDay] || [];
                const busyPeriods = periods.map((cls, idx) => ({ cls, idx })).filter(p => !isPeriodFree(p.cls));
                return (
                  <div key={absentId} style={{ background: 'white', borderRadius: '16px', marginBottom: '16px', overflow: 'hidden' }}>
                    <div style={{ background: 'linear-gradient(90deg, #ef4444, #f97316)', padding: '16px', color: 'white' }}>
                      <h3 style={{ fontWeight: 'bold' }}>{teacher.name}</h3>
                      <p style={{ fontSize: '12px', opacity: 0.9 }}>{teacher.subject}</p>
                    </div>
                    {busyPeriods.map(({cls, idx}) => {
                      const available = getAvailableSubstitutes(idx);
                      const currentSub = substitutions[`${absentId}_${idx}`];
                      return (
                        <div key={idx} style={{ padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                            <div style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: 'white', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{idx + 1}</div>
                            <div><p style={{ fontWeight: 'bold' }}>{cls}</p><p style={{ fontSize: '10px', color: '#64748b' }}>Period {idx + 1}</p></div>
                          </div>
                          <select value={currentSub || ""} onChange={(e) => handleAssignSubstitute(absentId, idx, e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '14px' }}>
                            <option value="">-- Select Substitute --</option>
                            {available.map(sub => (
                              <option key={sub.id} value={sub.id}>{sub.name} - {sub.subject}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Summary Tab */}
        {activeTab === 'summary' && (
          <div style={{ background: 'white', borderRadius: '16px', padding: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Substitution Report</h2>
              <button onClick={() => window.print()} style={{ background: '#1e293b', color: 'white', padding: '8px 16px', borderRadius: '12px', border: 'none', cursor: 'pointer' }}>Print PDF</button>
            </div>
            {absentTeachers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>No absentees today</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#4f46e5', color: 'white' }}>
                    <th style={{ padding: '12px' }}>Period</th>
                    <th>Class</th>
                    <th>Absent Teacher</th>
                    <th>Substitute</th>
                  </tr>
                </thead>
                <tbody>
                  {absentTeachers.flatMap(absentId => {
                    const teacher = teachers.find(t => t.id === absentId);
                    if(!teacher) return [];
                    const periods = (teacher.timetable[selectedDay] || []).map((cls, idx) => ({ cls, idx })).filter(p => !isPeriodFree(p.cls));
                    return periods.map(({cls, idx}) => {
                      const subId = substitutions[`${absentId}_${idx}`];
                      const subTeacher = teachers.find(t => t.id === Number(subId));
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '12px', textAlign: 'center' }}>{idx + 1}</td>
                          <td style={{ padding: '12px', fontWeight: 'bold' }}>{cls}</td>
                          <td style={{ padding: '12px' }}>{teacher.name}</td>
                          <td style={{ padding: '12px', color: subTeacher ? '#059669' : '#dc2626' }}>{subTeacher ? subTeacher.name : 'Not Assigned'}</td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>
    </div>
  );
}