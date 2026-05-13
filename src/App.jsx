
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Download, RotateCcw, Train, ClipboardList } from "lucide-react";
import "./styles.css";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_INDEX = Object.fromEntries(DAYS.map((d,i)=>[d,i]));
const NEXT_DAY = Object.fromEntries(DAYS.map((d,i)=>[d,DAYS[(i+1)%7]]));
const PREV_DAY = Object.fromEntries(DAYS.map((d,i)=>[d,DAYS[(i+6)%7]]));
const STORAGE_KEY = "extra-board-simulator-web-v11-turn-model";

const EXTRA_START = [
  { name:"Dave", reliefDay:"Monday", markupTime:"00:01" },
  { name:"Terry", reliefDay:"Wednesday", markupTime:"00:01" },
  { name:"Billy", reliefDay:"Thursday", markupTime:"00:01" },
  { name:"Jayden", reliefDay:"Saturday", markupTime:"00:01" },
];

// Jobs are complete turns now. If someone takes the outbound, they also take the return trip home.
const REGULAR_JOBS = [
  { regular:"Bill", pool:"PSC", turn:"27/28", outboundTrain:"27", returnTrain:"28", works:["Monday","Wednesday","Friday"], onDuty:"02:49", offDuty:"06:44", returnOnDuty:"20:46", returnTieUp:"00:47" },
  { regular:"Kevin", pool:"PSC", turn:"27/28", outboundTrain:"27", returnTrain:"28", works:["Tuesday","Thursday","Saturday"], onDuty:"02:49", offDuty:"06:44", returnOnDuty:"20:46", returnTieUp:"00:47" },

  { regular:"Chris", pool:"WEN", turn:"7/8", outboundTrain:"7", returnTrain:"8", works:["Monday","Thursday","Saturday"], onDuty:"02:24", offDuty:"06:50", returnOnDuty:"20:37", returnTieUp:"01:07" },
  { regular:"Ross", pool:"WEN", turn:"7/8", outboundTrain:"7", returnTrain:"8", works:["Tuesday","Friday","Sunday"], onDuty:"02:24", offDuty:"06:50", returnOnDuty:"20:37", returnTieUp:"01:07" },

  { regular:"Eric", pool:"WFH", turn:"8/7", outboundTrain:"8", returnTrain:"7", works:["Monday","Wednesday","Saturday"], onDuty:"00:30", offDuty:"07:21", returnOnDuty:"22:01", returnTieUp:"03:19" },
  { regular:"Brian", pool:"WFH", turn:"8/7", outboundTrain:"8", returnTrain:"7", works:["Tuesday","Thursday","Sunday"], onDuty:"00:30", offDuty:"07:21", returnOnDuty:"22:01", returnTieUp:"03:19" },

  { regular:"Mike", pool:"WEN Relief", turn:"7/8", outboundTrain:"7", returnTrain:"8", works:["Wednesday"], onDuty:"02:24", offDuty:"06:50", returnOnDuty:"20:37", returnTieUp:"01:07" },
  { regular:"Mike", pool:"WFH Relief", turn:"8/7", outboundTrain:"8", returnTrain:"7", works:["Friday"], onDuty:"00:30", offDuty:"07:21", returnOnDuty:"22:01", returnTieUp:"03:19" },
  { regular:"Mike", pool:"PSC Relief", turn:"27/28", outboundTrain:"27", returnTrain:"28", works:["Sunday"], onDuty:"02:49", offDuty:"06:44", returnOnDuty:"20:46", returnTieUp:"00:47" },
];

const defaultState = {
  boardOrder:["Dave","Terry","Billy","Jayden"],
  markupTimes:Object.fromEntries(EXTRA_START.map(e=>[e.name,e.markupTime])),
  workRelief:Object.fromEntries(EXTRA_START.map(e=>[e.name,false])),
  fullWeekVacations:{},
  singleRegularVacancies:[],
  pinups:[],
  extraVacations:[],
};

function parseTime(text){
  const clean=String(text||"").trim().replace(":","");
  const padded=clean.length===3 ? "0"+clean : clean;
  const h=Number(padded.slice(0,2)), m=Number(padded.slice(2,4));
  if(!Number.isFinite(h)||!Number.isFinite(m)||h<0||h>23||m<0||m>59) throw new Error(`Bad time: ${text}`);
  return h*60+m;
}

function fmtAbs(abs){
  const day=DAYS[Math.floor(abs/1440)%7];
  const mod=((abs%1440)+1440)%1440;
  return `${day} ${String(Math.floor(mod/60)).padStart(2,"0")}:${String(mod%60).padStart(2,"0")}`;
}

function parseAbs(text){
  const [day,time]=String(text||"").trim().split(/\s+/);
  if(!(day in DAY_INDEX)) throw new Error("Use format like Friday 01:07");
  return DAY_INDEX[day]*1440+parseTime(time);
}

function jobStartEndAbs(day,job){
  const s=parseTime(job.onDuty), e=parseTime(job.offDuty || job.returnTieUp);
  let start=DAY_INDEX[day]*1440+s, end=DAY_INDEX[day]*1440+e;
  if(e<s) end+=1440;
  return {start,end};
}

function returnTripStartAbs(day,job){
  if(job.pool==="PIN-UP") return jobStartEndAbs(day,job).start;
  const outboundStart = DAY_INDEX[day]*1440 + parseTime(job.onDuty);
  let retStart = DAY_INDEX[day]*1440 + parseTime(job.returnOnDuty);
  if(retStart <= outboundStart) retStart += 1440;
  return retStart;
}

function returnTripEndAbs(day,job){
  if(job.pool==="PIN-UP") return jobStartEndAbs(day,job).end;
  const retStart = returnTripStartAbs(day,job);
  let retEnd = DAY_INDEX[day]*1440 + parseTime(job.returnTieUp);
  while(retEnd <= retStart) retEnd += 1440;
  return retEnd;
}

function requiredRestMinutes(start,end){ return end-start < 720 ? 480 : 600; }

function uniqueRegulars(){ return [...new Set(REGULAR_JOBS.map(j=>j.regular))]; }
function jobsForRegularOnDay(regular,day){ return REGULAR_JOBS.filter(j=>j.regular===regular && j.works.includes(day)); }
function allWorkingDaysForRegular(regular){
  const set=new Set();
  REGULAR_JOBS.forEach(j=>{ if(j.regular===regular) j.works.forEach(d=>set.add(d)); });
  return DAYS.filter(d=>set.has(d));
}
function holdExtra(value){ return value && typeof value==="object" ? value.extra || "None" : value || "None"; }
function holdDays(regular,value){
  if(value && typeof value==="object" && Array.isArray(value.days) && value.days.length) return value.days;
  return allWorkingDaysForRegular(regular);
}
function shortDays(days){ return days.map(d=>d.slice(0,3)).join(", "); }
function turnName(job){ return job.pool==="PIN-UP" ? job.train : `${job.pool} ${job.turn}`; }
function actualTieUpLabel(employee,day,job,regular=null,holdDown=false){
  if(job.pool==="PIN-UP") return `${employee} ${day.slice(0,3)} PIN-UP ${job.train}`;
  const base = `${employee}${holdDown && regular ? ` HOLD-DOWN for ${regular} —` : ""} ${day.slice(0,3)} ${job.pool} ${job.turn} turn`;
  const cover = (!holdDown && regular) ? ` for ${regular}` : "";
  return `${base}${cover}`;
}

function List({items,onRemove}){
  if(!items.length) return <p className="empty">None added</p>;
  return <div className="list">{items.map((item,i)=><div className="listItem" key={i}><span>{item}</span><button className="small danger" onClick={()=>onRemove(i)}>Remove</button></div>)}</div>;
}

function App(){
  const [state,setState]=useState(()=>{ try{ const s=localStorage.getItem(STORAGE_KEY); return s?{...defaultState,...JSON.parse(s)}:defaultState; }catch{return defaultState;} });
  const [result,setResult]=useState("");
  const [actualJobs,setActualJobs]=useState([]);
  const [actualResult,setActualResult]=useState("");
  const [summaryFontSize,setSummaryFontSize]=useState(14);
  const [summaryFullscreen,setSummaryFullscreen]=useState(false);
  const [holdDaySelection,setHoldDaySelection]=useState([]);

  useEffect(()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(state)),[state]);

  const regulars=useMemo(uniqueRegulars,[]);
  const extras=EXTRA_START.map(e=>e.name);
  const update=p=>setState(s=>({...s,...p}));

  function isExtraVacation(name,day){ return state.extraVacations.some(v=>v.name===name&&v.day===day); }
  function moveToBottom(board,name){
    const i=board.findIndex(e=>e.name===name);
    if(i<0)return false;
    const [x]=board.splice(i,1);
    board.push(x);
    return true;
  }
  function reorderByAvailability(board,current,availability){
    const original=Object.fromEntries(board.map((e,i)=>[e.name,i]));
    board.sort((a,b)=>{
      const at=availability[a.name]>current?availability[a.name]:current;
      const bt=availability[b.name]>current?availability[b.name]:current;
      return at-bt || original[a.name]-original[b.name];
    });
  }
  function boardSections(board,day,current,availability){
    const boardRows=[], relief=[], vacation=[], holdDown=[];
    for(const e of board){
      const until=availability[e.name]||0;
      if(e.holdDownRegular){ holdDown.push(`${e.name} — holding down ${e.holdDownRegular}`); continue; }
      if(isExtraVacation(e.name,day)){ vacation.push(`${e.name} — vacation; marks up ${NEXT_DAY[day]} 00:01`); continue; }
      if(e.reliefDay===day){ relief.push(`${e.name} — relief day; normal markup ${NEXT_DAY[day]} ${e.markupTime}`); continue; }
      boardRows.push(until>current ? `${e.name} — available ${fmtAbs(until)}` : e.name);
    }
    return {boardRows,relief,vacation,holdDown};
  }
  function appendBoardSections(lines,board,day,current,availability,label="Ending Board Order"){
    const s=boardSections(board,day,current,availability);
    lines.push(`${label}:`);
    if(s.boardRows.length) s.boardRows.forEach((n,i)=>lines.push(`${i+1}. ${n}`)); else lines.push("- None on board");
    if(s.relief.length){ lines.push(""); lines.push("Relief:"); s.relief.forEach(x=>lines.push(`- ${x}`)); }
    if(s.vacation.length){ lines.push(""); lines.push("Vacation:"); s.vacation.forEach(x=>lines.push(`- ${x}`)); }
    if(s.holdDown.length){ lines.push(""); lines.push("Hold-Down / N/A:"); s.holdDown.forEach(x=>lines.push(`- ${x}`)); }
  }

  function processDayStartMarkups(board,day,availability,lines){
    const prev=PREV_DAY[day], moved=new Set();
    const todayVac=new Set(state.extraVacations.filter(v=>v.day===day).map(v=>v.name));
    for(const name of todayVac) availability[name]=Math.max(availability[name]||0,(DAY_INDEX[day]+1)*1440+1);

    const vacEnded=[...new Set(state.extraVacations.filter(v=>v.day===prev).map(v=>v.name))];
    for(const name of vacEnded){
      if(todayVac.has(name)){ lines.push(`  hold ${name}: vacation continues today; not marking up until ${NEXT_DAY[day]} 00:01`); continue; }
      if(moveToBottom(board,name)){
        moved.add(name);
        availability[name]=Math.max(availability[name]||0,DAY_INDEX[day]*1440+1);
        lines.push(`  markup ${name}: vacation ended ${day} 00:01; moved to bottom`);
      }
    }

    for(const e of [...board]){
      if(e.reliefDay===prev && !moved.has(e.name)){
        if(todayVac.has(e.name)){ lines.push(`  hold ${e.name}: relief ended ${day} ${e.markupTime}, but vacation today; not marking up until ${NEXT_DAY[day]} 00:01`); continue; }
        if(moveToBottom(board,e.name)){
          moved.add(e.name);
          availability[e.name]=Math.max(availability[e.name]||0,DAY_INDEX[day]*1440+parseTime(e.markupTime));
          lines.push(`  markup ${e.name}: relief ended ${day} ${e.markupTime}; moved to bottom`);
        }
      }
    }
    reorderByAvailability(board,DAY_INDEX[day]*1440,availability);
    if(moved.size||todayVac.size) lines.push("");
  }

  function callNext(board,day,job,start,returnStart,returnEnd,availability,lines){
    const next=NEXT_DAY[day];

    for(const employee of [...board]){
      const idx=board.findIndex(e=>e.name===employee.name);
      if(employee.holdDownRegular){ lines.push(`  skip ${employee.name}: N/A holding down ${employee.holdDownRegular}`); continue; }
      if(employee.reliefDay===day && !state.workRelief[employee.name]){ lines.push(`  skip ${employee.name}: job starts on relief day and Work Relief is not checked`); continue; }
      if(isExtraVacation(employee.name,day)){ lines.push(`  skip ${employee.name}: vacation day`); continue; }
      if(returnEnd>DAY_INDEX[next]*1440 && isExtraVacation(employee.name,next)){ lines.push(`  skip ${employee.name}: trip works into ${next}, but ${employee.name} has vacation`); continue; }
      if(start<(availability[employee.name]||0)){ lines.push(`  skip ${employee.name}: not available until ${fmtAbs(availability[employee.name])}`); continue; }

      const [called]=board.splice(idx,1);
      board.push(called);

      if(returnEnd>DAY_INDEX[next]*1440 && called.reliefDay===next){
        availability[called.name]=returnEnd+1440;
        lines.push(`  ${called.name} works into relief day ${next}; marks up 24h after return tie-up at ${fmtAbs(availability[called.name])}`);
      }else{
        const rest=requiredRestMinutes(returnStart,returnEnd);
        availability[called.name]=returnEnd+rest;
        lines.push(`  ${called.name} next available after return/rest (${rest/60}h rest) at ${fmtAbs(availability[called.name])}`);
      }
      return called;
    }
    return null;
  }

  function runSimulation(){
    const lines=[], employeeSummary={}, dailySummary=Object.fromEntries(DAYS.map(d=>[d,[]])), availability={}, workedJobs=[];
    const board=state.boardOrder.filter(n=>n!=="N/A").map(name=>{
      const base=EXTRA_START.find(e=>e.name===name);
      return {...base,markupTime:state.markupTimes[name]||base.markupTime,holdDownRegular:null};
    });

    for(const [regular,value] of Object.entries(state.fullWeekVacations)){
      const extra=holdExtra(value);
      if(extra!=="None"){
        const e=board.find(x=>x.name===extra);
        if(e)e.holdDownRegular=regular;
      }
    }

    lines.push("RAILROAD EXTRA BOARD WEEKLY SIMULATION","=".repeat(80),"Jobs are modeled as complete turns: outbound plus return trip home.","Auto rest rule: return leg under 12h = 8h rest; return leg 12h or more = 10h rest","");
    lines.push("Starting board:");
    board.forEach((e,i)=>lines.push(`${i+1}. ${e.name}${e.holdDownRegular?` — N/A holding down ${e.holdDownRegular}`:""}`));
    lines.push("");

    const vacanciesByDay=Object.fromEntries(DAYS.map(d=>[d,[]]));

    for(const [regular,value] of Object.entries(state.fullWeekVacations)){
      const extra=holdExtra(value);
      for(const day of holdDays(regular,value)){
        for(const job of jobsForRegularOnDay(regular,day)){
          vacanciesByDay[day].push({day,regular,job,reason:"Hold-down / week vacation",holdDown:extra});
        }
      }
    }

    for(const vac of state.singleRegularVacancies){
      for(const job of jobsForRegularOnDay(vac.regular,vac.day)){
        vacanciesByDay[vac.day].push({day:vac.day,regular:vac.regular,job,reason:"Single-day vacation",holdDown:"None"});
      }
    }

    for(const p of state.pinups){
      const job={regular:"PIN-UP",pool:"PIN-UP",turn:p.label,train:p.label,works:[p.day],onDuty:p.onDuty,offDuty:p.offDuty};
      vacanciesByDay[p.day].push({day:p.day,regular:"PIN-UP",job,reason:"Pin-up / extra-board job",holdDown:"None"});
    }

    for(const day of DAYS){
      lines.push("=".repeat(80),day.toUpperCase(),"=".repeat(80));
      processDayStartMarkups(board,day,availability,lines);
      appendBoardSections(lines,board,day,DAY_INDEX[day]*1440,availability,"Starting Board Order");
      lines.push("");

      const jobs=vacanciesByDay[day];
      if(!jobs.length) lines.push("Open jobs: none");
      else{
        lines.push("Open jobs:");
        for(const v of jobs){
          const {start}=jobStartEndAbs(day,v.job), retStart=returnTripStartAbs(day,v.job), ret=returnTripEndAbs(day,v.job);
          if(v.regular==="PIN-UP"){
            lines.push(`- PIN-UP ${v.job.train} | ${v.reason} | ON ${fmtAbs(start)} OFF/RETURN ${fmtAbs(ret)}`);
          }else{
            lines.push(`- ${turnName(v.job)} | ${v.regular} off | ${v.reason} | OUTBOUND ON ${fmtAbs(start)} RETURN ON ${fmtAbs(retStart)} RETURN TIE-UP ${fmtAbs(ret)}`);
          }
        }

        lines.push("","Assignments:");
        for(const v of jobs){
          const {start}=jobStartEndAbs(day,v.job), ret=returnTripEndAbs(day,v.job), returnStart=returnTripStartAbs(day,v.job);

          if(v.holdDown!=="None"){
            const text=`${v.holdDown} works ${turnName(v.job)} turn holding down ${v.regular} | OUTBOUND ON ${fmtAbs(start)} RETURN TIE-UP ${fmtAbs(ret)}`;
            lines.push(`- ${text}`);
            dailySummary[day].push(text);
            employeeSummary[v.holdDown]=[...(employeeSummary[v.holdDown]||[]),`${day.slice(0,3)} ${turnName(v.job)}`];
            workedJobs.push({
              id:`${day}-${v.holdDown}-${workedJobs.length}`,
              employee:v.holdDown, day, pool:v.job.pool, train:v.job.turn,
              label:actualTieUpLabel(v.holdDown,day,v.job,v.regular,true),
              plannedReturn:fmtAbs(ret), actualReturn:fmtAbs(ret)
            });
            continue;
          }

          const called=callNext(board,day,v.job,start,returnStart,ret,availability,lines);
          let text;

          if(!called){
            text=v.regular==="PIN-UP"
              ? `NO AVAILABLE EXTRA BOARD EMPLOYEE for ${v.job.train} pin-up`
              : `NO AVAILABLE EXTRA BOARD EMPLOYEE for ${turnName(v.job)} covering ${v.regular}`;
          }else if(v.regular==="PIN-UP"){
            text=`${called.name} works pin-up ${v.job.train} | ON ${fmtAbs(start)} OFF ${fmtAbs(ret)}`;
            employeeSummary[called.name]=[...(employeeSummary[called.name]||[]),`${day.slice(0,3)} PIN-UP ${v.job.train}`];
            workedJobs.push({
              id:`${day}-${called.name}-PIN-${workedJobs.length}`,
              employee:called.name, day, pool:"PIN-UP", train:v.job.train,
              label:actualTieUpLabel(called.name,day,v.job),
              plannedReturn:fmtAbs(ret), actualReturn:fmtAbs(ret)
            });
          }else{
            text=`${called.name} works ${turnName(v.job)} turn for ${v.regular} | OUTBOUND ON ${fmtAbs(start)} RETURN TIE-UP ${fmtAbs(ret)}`;
            employeeSummary[called.name]=[...(employeeSummary[called.name]||[]),`${day.slice(0,3)} ${turnName(v.job)}`];
            workedJobs.push({
              id:`${day}-${called.name}-${workedJobs.length}`,
              employee:called.name, day, pool:v.job.pool, train:v.job.turn,
              label:actualTieUpLabel(called.name,day,v.job,v.regular,false),
              plannedReturn:fmtAbs(ret), actualReturn:fmtAbs(ret)
            });
          }

          lines.push(`- ${text}`);
          dailySummary[day].push(text);
        }
      }

      lines.push("");
      appendBoardSections(lines,board,day,DAY_INDEX[day]*1440,availability);
      lines.push("");
    }

    lines.push("","#".repeat(80),"EMPLOYEE WEEKLY WORK SUMMARY","#".repeat(80));
    [...regulars,...extras].forEach(name=>lines.push(`${name}: ${(employeeSummary[name]||["no extra-board assignments"]).join(", ")}`));
    lines.push("","#".repeat(80),"DAILY WORK SUMMARY","#".repeat(80));
    for(const day of DAYS){
      lines.push(`${day}:`);
      if(dailySummary[day].length) dailySummary[day].forEach(x=>lines.push(`- ${x}`)); else lines.push("- No extra board coverage needed");
      lines.push("");
    }

    setResult(lines.join("\n"));
    setActualJobs(workedJobs);
    setActualResult("");
  }

  function recalcActualSummary(){
    if(!actualJobs.length){ alert("Run the planned simulation first."); return; }
    try{
      const sorted=[...actualJobs].sort((a,b)=>parseAbs(a.actualReturn)-parseAbs(b.actualReturn));
      const lines=["ACTUAL / ADJUSTED RETURN TIE-UP SUMMARY","=".repeat(80),"Based on edited actual return tie-up times.","","Edited Return Tie-Up Order:"];
      sorted.forEach((j,i)=>lines.push(`${i+1}. ${j.label} — actual return tie-up ${j.actualReturn}`));
      lines.push("","Employee Actual Work:");
      const byEmp={};
      sorted.forEach(j=>byEmp[j.employee]=[...(byEmp[j.employee]||[]),`${j.label} tie-up ${j.actualReturn}`]);
      [...regulars,...extras].forEach(name=>lines.push(`${name}: ${(byEmp[name]||["no adjusted assignments"]).join(", ")}`));
      setActualResult(lines.join("\n"));
    }catch(e){ alert(e.message); }
  }

  function downloadSummary(){
    const combined=[result||"Run the simulation first.",actualResult?`\n\n${actualResult}`:""].join("");
    const blob=new Blob([combined],{type:"text/plain"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="extra_board_simulation_summary.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function clearAll(){
    if(!confirm("Clear all saved entries?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setState(defaultState);
    setResult("");
    setActualJobs([]);
    setActualResult("");
  }

  function addHoldDown(){
    const regular=document.getElementById("holdRegular").value;
    const extra=document.getElementById("holdExtra").value;
    const days=holdDaySelection.length ? holdDaySelection : allWorkingDaysForRegular(regular);
    update({fullWeekVacations:{...state.fullWeekVacations,[regular]:{extra,days}}});
    setHoldDaySelection([]);
  }
  function removeHoldDown(regular){
    const copy={...state.fullWeekVacations};
    delete copy[regular];
    update({fullWeekVacations:copy});
  }
  function addRegularVacancy(){
    const day=document.getElementById("singleDay").value, regular=document.getElementById("singleRegular").value;
    if(!jobsForRegularOnDay(regular,day).length){alert(`${regular} does not normally work on ${day}`);return;}
    update({singleRegularVacancies:[...state.singleRegularVacancies,{day,regular}]});
  }
  function addPinup(){
    const day=document.getElementById("pinupDay").value, label=document.getElementById("pinupLabel").value||"Yard Switching", onDuty=document.getElementById("pinupOn").value||"23:30", offDuty=document.getElementById("pinupOff").value||"03:30";
    try{parseTime(onDuty);parseTime(offDuty);}catch{alert("Bad time. Use 08:00, 2030, 22:15, etc.");return;}
    update({pinups:[...state.pinups,{day,label,onDuty,offDuty}]});
  }
  function addExtraVacation(){
    const day=document.getElementById("extraVacDay").value, name=document.getElementById("extraVacName").value;
    if(state.extraVacations.some(v=>v.day===day&&v.name===name)){alert(`${name} is already marked off ${day}`);return;}
    update({extraVacations:[...state.extraVacations,{day,name}]});
  }
  function toggleHoldDay(day){
    setHoldDaySelection(current => current.includes(day) ? current.filter(d=>d!==day) : DAYS.filter(d=>[...current,day].includes(d)));
  }
  function summaryControls(){
    return <div className="summaryControls">
      <button onClick={()=>setSummaryFontSize(s=>Math.max(11,s-1))}>A-</button>
      <button onClick={()=>setSummaryFontSize(s=>Math.min(24,s+1))}>A+</button>
      <button className="secondary" onClick={()=>setSummaryFontSize(14)}>Reset</button>
      <button className="secondary" onClick={()=>setSummaryFullscreen(true)}>Fullscreen</button>
    </div>;
  }
  function actionButtons(extraClass=""){
    return <div className={`actionButtons ${extraClass}`}>
      <button onClick={runSimulation}><ClipboardList size={18}/> Run</button>
      <button className="secondary" onClick={downloadSummary}><Download size={18}/> Save Summary</button>
      <button className="danger" onClick={clearAll}><RotateCcw size={18}/> Clear</button>
    </div>;
  }

  return <div className="app">
    <header>
      <div><p className="eyebrow">Railroad Crew Board Tool</p><h1><Train size={28}/> Extra Board Simulator</h1></div>
      <div className="headerActions">{actionButtons()}</div>
    </header>

    <main className="grid">
      <section className="card">
        <h2>Setup</h2>
        <h3>Starting Board</h3>
        {state.boardOrder.map((name,i)=><label className="row" key={i}><span>Position {i+1}</span><select value={name} onChange={e=>{const copy=[...state.boardOrder];copy[i]=e.target.value;update({boardOrder:copy});}}>{["N/A",...extras].map(o=><option key={o}>{o}</option>)}</select></label>)}

        <h3>Relief / Markup</h3>
        {EXTRA_START.map(e=><div className="subcard" key={e.name}>
          <b>{e.name}</b>
          <small>Relief day: {e.reliefDay}</small>
          <label className="row"><span>Markup</span><input value={state.markupTimes[e.name]||"00:01"} onChange={ev=>update({markupTimes:{...state.markupTimes,[e.name]:ev.target.value}})}/></label>
          <label className="check"><input type="checkbox" checked={!!state.workRelief[e.name]} onChange={ev=>update({workRelief:{...state.workRelief,[e.name]:ev.target.checked}})}/>May start job on relief day</label>
        </div>)}
      </section>

      <section className="card">
        <h2>Vacancies / Jobs</h2>
        <div className="subcard">
          <h3>Full-Week Vacation / Hold-Down</h3>
          <label>Regular</label><select id="holdRegular">{regulars.map(r=><option key={r}>{r}</option>)}</select>
          <label>Extra taking hold-down</label><select id="holdExtra">{["None",...extras].map(x=><option key={x}>{x}</option>)}</select>
          <label>Hold-down days</label>
          <div className="dayButtons">{DAYS.map(day=><button key={day} type="button" className={holdDaySelection.includes(day)?"dayButton active":"dayButton"} onClick={()=>toggleHoldDay(day)}>{day.slice(0,3)}</button>)}</div>
          <small>Leave all days unselected to use the regular's normal work days.</small>
          <button onClick={addHoldDown}>Add / Update Hold-Down</button>
          <List items={Object.entries(state.fullWeekVacations).map(([r,e])=>`${r} → ${holdExtra(e)==="None"?"vacation, no hold-down":`${holdExtra(e)} hold-down`} (${shortDays(holdDays(r,e))})`)} onRemove={idx=>removeHoldDown(Object.keys(state.fullWeekVacations)[idx])}/>
        </div>

        <div className="subcard">
          <h3>Single-Day Regular Vacancy</h3>
          <label>Day</label><select id="singleDay">{DAYS.map(d=><option key={d}>{d}</option>)}</select>
          <label>Regular off</label><select id="singleRegular">{regulars.map(r=><option key={r}>{r}</option>)}</select>
          <button onClick={addRegularVacancy}>Add Regular Vacancy</button>
          <List items={state.singleRegularVacancies.map(v=>`${v.day} → ${v.regular}`)} onRemove={idx=>update({singleRegularVacancies:state.singleRegularVacancies.filter((_,i)=>i!==idx)})}/>
        </div>

        <div className="subcard">
          <h3>Pin-Up / Extra Job</h3>
          <label>Day</label><select id="pinupDay">{DAYS.map(d=><option key={d}>{d}</option>)}</select>
          <label>Job label</label><input id="pinupLabel" defaultValue="Yard Switching"/>
          <label>On duty</label><input id="pinupOn" defaultValue="23:30"/>
          <label>Off duty</label><input id="pinupOff" defaultValue="03:30"/>
          <small>If off time is earlier than on time, it ties up next day.</small>
          <button onClick={addPinup}>Add Pin-Up</button>
          <List items={state.pinups.map(p=>`${p.day} → ${p.label} ON ${p.onDuty} OFF ${p.offDuty}`)} onRemove={idx=>update({pinups:state.pinups.filter((_,i)=>i!==idx)})}/>
        </div>

        <div className="subcard">
          <h3>Extra Board Vacation</h3>
          <label>Day</label><select id="extraVacDay">{DAYS.map(d=><option key={d}>{d}</option>)}</select>
          <label>Extra employee</label><select id="extraVacName">{extras.map(x=><option key={x}>{x}</option>)}</select>
          <button onClick={addExtraVacation}>Add Extra Vacation</button>
          <List items={state.extraVacations.map(v=>`${v.day} → ${v.name}`)} onRemove={idx=>update({extraVacations:state.extraVacations.filter((_,i)=>i!==idx)})}/>
        </div>
      </section>

      <section className="card results">
        <div className="mobileActionRow">{actionButtons("bottomActions")}</div>

        <h2>Actual Return Tie-Up Adjustments</h2>
        <p className="empty">Run planned simulation first, then edit actual return tie-up times if return trips arrive out of order.</p>
        {actualJobs.length?<div className="actualList">{actualJobs.map((job,idx)=><div className="actualRow" key={job.id}>
          <label>{job.label}</label>
          <small>Planned return tie-up / markup time: {job.plannedReturn}</small>
          <input value={job.actualReturn} onChange={ev=>{const copy=[...actualJobs];copy[idx]={...copy[idx],actualReturn:ev.target.value};setActualJobs(copy);}}/>
        </div>)}<button onClick={recalcActualSummary}>Recalculate Actual Board</button></div>:<p className="empty">No worked jobs generated yet.</p>}

        {actualResult&&<>
          <h3>Adjusted Summary</h3>
          {summaryControls()}
          <pre className="summaryPre" style={{fontSize:`${summaryFontSize}px`}}>{actualResult}</pre>
        </>}

        <h2>Planned Simulation Summary</h2>
        {summaryControls()}
        <pre className="summaryPre" style={{fontSize:`${summaryFontSize}px`}}>{result||"Run the simulation to see results here."}</pre>

        {summaryFullscreen&&<div className="summaryModal">
          <div className="summaryModalHeader"><strong>Simulation Summary</strong><button className="danger" onClick={()=>setSummaryFullscreen(false)}>Close</button></div>
          <div className="summaryModalControls">{summaryControls()}</div>
          <pre className="summaryPre modalPre" style={{fontSize:`${summaryFontSize}px`}}>{[actualResult,result].filter(Boolean).join("\n\n") || "Run the simulation to see results here."}</pre>
        </div>}
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById("root")).render(<App/>);
