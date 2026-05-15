
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Download, RotateCcw, Train, ClipboardList } from "lucide-react";
import "./styles.css";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_INDEX = Object.fromEntries(DAYS.map((d,i)=>[d,i]));
const NEXT_DAY = Object.fromEntries(DAYS.map((d,i)=>[d,DAYS[(i+1)%7]]));
const PREV_DAY = Object.fromEntries(DAYS.map((d,i)=>[d,DAYS[(i+6)%7]]));
const STORAGE_KEY = "extra-board-simulator-web-v12-board-replay-beta";

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


const ROUTE_DEFAULTS = {
  PSC:{terminal:"PSC", outboundTrain:"27", returnTrain:"28", turn:"27/28", awayTieUp:"06:44", returnOnDuty:"20:46", returnTieUp:"00:47"},
  WEN:{terminal:"WEN", outboundTrain:"7", returnTrain:"8", turn:"7/8", awayTieUp:"06:50", returnOnDuty:"20:37", returnTieUp:"01:07"},
  WFH:{terminal:"WFH", outboundTrain:"8", returnTrain:"7", turn:"8/7", awayTieUp:"07:21", returnOnDuty:"22:01", returnTieUp:"03:19"},
};

const MANUAL_JOB_TYPES = [
  "Add return train",
  "DHE home only",
  "DHE out + work return train",
  "Other manual job",
];

const defaultState = {
  boardOrder:["Dave","Terry","Billy","Jayden"],
  markupTimes:Object.fromEntries(EXTRA_START.map(e=>[e.name,e.markupTime])),
  workRelief:Object.fromEntries(EXTRA_START.map(e=>[e.name,false])),
  fullWeekVacations:{},
  singleRegularVacancies:[],
  pinups:[],
  extraVacations:[],
  blockTraining:[],
  doubleOuts:[],
  canceledTrains:[],
  createdTrains:[],
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
  const [rawDay,time]=String(text||"").trim().split(/\s+/);
  const day=DAYS.find(d=>d.toLowerCase()===String(rawDay||"").toLowerCase());
  if(!day) throw new Error("Use format like Friday 01:07");
  return DAY_INDEX[day]*1440+parseTime(time);
}

function eventIdFor(day, job, regular){
  return `${day}|${regular}|${job.pool}|${job.turn || job.train}`;
}

function jobKey(job){
  if(job.pool==="PIN-UP") return `PIN-UP ${job.train}`;
  return `${job.pool} ${job.turn}`;
}

function cancelMatches(cancel,day,job,regular){
  if(cancel.day!==day) return false;
  const key=jobKey(job);
  if(cancel.target==="Any") return true;
  if(cancel.target===key) return true;
  if(cancel.regular && cancel.regular!=="Any" && cancel.regular!==regular) return false;
  return false;
}

function cancellationFor(day,job,regular,cancellations){
  return cancellations.find(c=>cancelMatches(c,day,job,regular));
}

function parseActualReturnForJob(job,text){
  // Actual tie-up fields are attached to the job that created them.
  // This keeps Sunday jobs that tie up Monday from sorting at the top of the week.
  let abs=parseAbs(text);
  const anchor=job.startAbs ?? 0;
  while(abs<=anchor) abs+=7*1440;
  return abs;
}

function parseActualAwayForJob(job,text){
  let abs=parseAbs(text);
  const anchor=job.startAbs ?? 0;
  while(abs<anchor) abs+=7*1440;
  return abs;
}

function editReturnValue(edit){ return edit && typeof edit==="object" ? edit.return : edit; }
function editAwayValue(edit){ return edit && typeof edit==="object" ? edit.away : null; }

function awayRestWarning(job){
  if(!job.plannedAway || job.pool==="PIN-UP" || job.status==="UNFILLED") return "";
  try{
    const awayText=job.actualAway || job.plannedAway;
    if(!awayText || String(awayText).trim().split(/\s+/).length < 2) return "";
    const awayAbs=parseActualAwayForJob(job,awayText);
    const returnStart=job.returnStartAbs;
    if(!returnStart) return "";
    const rested=awayAbs+480;
    if(rested>returnStart){
      return `WARNING: not rested for return trip. Away off-duty ${fmtAbs(awayAbs)}, return on-duty ${fmtAbs(returnStart)}, rested ${fmtAbs(rested)}. Create DHE/replacement if needed.`;
    }
  }catch{
    // User may be mid-editing, like "Saturday 15:".
    // Do not crash the page; just wait until the value is valid.
    return "";
  }
  return "";
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
function allPeople(){ return [...uniqueRegulars(), ...EXTRA_START.map(e=>e.name)]; }
function inclusiveDays(startDay,endDay){
  const out=[]; let i=DAY_INDEX[startDay], end=DAY_INDEX[endDay];
  for(let safety=0;safety<8;safety++){ out.push(DAYS[i%7]); if((i%7)===end) break; i++; }
  return out;
}
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
function holdReturnAbs(value){
  if(!value || typeof value!=="object") return Infinity;
  if(value.holdContinues) return Infinity;
  if(value.holdMarkupDay && value.holdMarkupTime) return DAY_INDEX[value.holdMarkupDay]*1440+parseTime(value.holdMarkupTime);
  return Infinity;
}
function holdReturnLabel(value){
  const abs=holdReturnAbs(value);
  if(!Number.isFinite(abs)) return "continues / no return this week";
  return `marks up ${fmtAbs(abs)}`;
}
function isHoldActive(employee,abs){ return employee.holdDownRegular && abs < (employee.holdReturnAbs ?? Infinity); }
function holdHasEnded(employee,abs){ return employee.holdDownRegular && Number.isFinite(employee.holdReturnAbs) && abs >= employee.holdReturnAbs; }
function shortDays(days){ return days.map(d=>d.slice(0,3)).join(", "); }
function routeDefaults(pool){
  const clean=String(pool||"").replace(/ Relief$/,"");
  return ROUTE_DEFAULTS[clean] || ROUTE_DEFAULTS.PSC;
}
function dheFor(day,pool,pinups){
  const clean=String(pool||"").replace(/ Relief$/,"");
  return pinups.find(p=>p.type==="DHE" && p.day===day && p.route===clean);
}
function makeStandaloneDheVacancy(p, clean, d, reason){
  const job={
    regular:"DHE",
    pool:clean,
    turn:d.turn,
    train:`DHE to ${clean} / return ${d.returnTrain}`,
    outboundTrain:"DHE",
    returnTrain:d.returnTrain,
    works:[p.day],
    onDuty:p.onDuty || d.awayTieUp,
    offDuty:p.awayTieUp || d.awayTieUp,
    returnOnDuty:d.returnOnDuty,
    returnTieUp:d.returnTieUp,
    isDhe:true,
    dheTo:clean,
    tieUpLocation:"SPK"
  };
  return {day:p.day, regular:"DHE", job, reason, holdDown:"None"};
}
function turnName(job){ return job.pool==="PIN-UP" ? job.train : `${job.pool} ${job.turn}`; }
function actualTieUpLabel(employee,day,job,regular=null,holdDown=false){
  if(job.pool==="PIN-UP") return `${employee} ${day.slice(0,3)} PIN-UP ${job.train}`;
  if(job.isDhe) return `${employee} ${day.slice(0,3)} DHE to ${job.dheTo} / return ${job.pool} ${job.returnTrain || job.turn}`;
  if(job.manualJobType) return `${employee} ${day.slice(0,3)} ${job.manualJobType}: ${job.turn}`;
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
  const [actualEdits,setActualEdits]=useState(()=>{ try{ return JSON.parse(localStorage.getItem(`${STORAGE_KEY}-actual-edits`)||"{}"); }catch{return {};} });
  const [actualResult,setActualResult]=useState("");
  const [summaryMode,setSummaryMode]=useState("Planned");
  const [summaryFontSize,setSummaryFontSize]=useState(14);
  const [summaryFullscreen,setSummaryFullscreen]=useState(false);
  const [holdDaySelection,setHoldDaySelection]=useState([]);
  const [extraJobType,setExtraJobType]=useState("PINUP");
  const [openSections,setOpenSections]=useState({
    startingBoard:false,
    reliefMarkup:false,
    hold:false,
    single:false,
    extraJob:false,
    cancels:false,
    extraVac:false,
    block:false,
    doubleOut:false
  });

  useEffect(()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(state)),[state]);
  useEffect(()=>localStorage.setItem(`${STORAGE_KEY}-actual-edits`,JSON.stringify(actualEdits)),[actualEdits]);

  const regulars=useMemo(uniqueRegulars,[]);
  const extras=EXTRA_START.map(e=>e.name);
  const people=useMemo(allPeople,[]);
  const update=p=>setState(s=>({...s,...p}));

  function isExtraVacation(name,day){ return state.extraVacations.some(v=>v.name===name&&v.day===day); }

  function blockIntervalsFor(name){
    return state.blockTraining.filter(b=>b.employee===name).map(b=>{
      const start=DAY_INDEX[b.startDay]*1440+parseTime(b.startTime||"08:00");
      let markup=DAY_INDEX[b.markupDay]*1440+parseTime(b.markupTime||"00:01");
      while(markup<=start) markup+=7*1440;
      return {...b,start,markup,rested:markup+480};
    });
  }

  function blockRestedTimeAbs(name,abs){
    // Block training still needs 8 hours rest before that person can work again.
    const hit=blockIntervalsFor(name).find(b=>abs>=b.start && abs<b.rested);
    return hit ? hit.rested : null;
  }

  function blockStartConflict(name,returnEnd){
    // A person also needs 8 hours rest before block training starts.
    // If a job return tie-up would leave less than 8h before block, they should not take that job.
    const hit=blockIntervalsFor(name).find(b=>returnEnd<=b.start && returnEnd+480>b.start);
    return hit || null;
  }

  function blockMarkupForDay(name,day){
    const dayStart=DAY_INDEX[day]*1440, dayEnd=dayStart+1440;
    const hits=blockIntervalsFor(name).filter(b=>b.markup>=dayStart && b.markup<dayEnd);
    if(!hits.length) return null;
    return Math.min(...hits.map(b=>b.markup));
  }

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
  function activeStatusLabel(status,current){
    if(!status) return null;
    if(status.kind==="WORKING" && status.until!==undefined && current>=status.until) return null;
    return status.label;
  }

  function isSameDayAbs(abs,day){
    const start=DAY_INDEX[day]*1440;
    return abs>=start && abs<start+1440;
  }

  function boardSections(board,day,current,availability,statusByEmployee={}){
    const boardRows=[], unavailableReasons=[];
    const dayStart=DAY_INDEX[day]*1440;
    const dayEnd=dayStart+1440;

    for(const e of board){
      const until=availability[e.name]||0;
      const blockRested=blockRestedTimeAbs(e.name,current);
      const status=statusByEmployee[e.name];
      const statusLabel=activeStatusLabel(status,current);

      // Hold-down removes the employee from the board only until its manual return time.
      if(isHoldActive(e,current)){
        const ret=e.holdReturnAbs ?? Infinity;
        if(Number.isFinite(ret) && ret<dayEnd){
          boardRows.push(`${e.name} — available ${fmtAbs(ret)}`);
        }else{
          unavailableReasons.push(`${e.name} — HOLD-DOWN for ${e.holdDownRegular}${Number.isFinite(ret)?`; marks up ${fmtAbs(ret)}`:""}`);
        }
        continue;
      }

      const sameDayAvailable =
        (until>current && until<dayEnd) ||
        (blockRested!==null && blockRested<dayEnd);

      // Uniform daily board rule:
      // If they are or will be available at any point today, show them in board order.
      // Board order only needs the availability note, not the job/status reason.
      // Exception: hard unavailable statuses like HOLD-DOWN stay under Unavailable.
      if(sameDayAvailable){
        const visibleUntil=Math.max(until, blockRested || 0);
        boardRows.push(`${e.name} — available ${fmtAbs(visibleUntil)}`);
        continue;
      }

      if(until<=current && blockRested===null && !isExtraVacation(e.name,day) && (e.reliefDay!==day || holdHasEnded(e,current))){
        boardRows.push(e.name);
        continue;
      }

      // Unavailable reasons live here, not in board order.
      if(blockRested!==null){ unavailableReasons.push(`${e.name} — BLOCK; available ${fmtAbs(blockRested)}`); continue; }
      if(isExtraVacation(e.name,day)){ unavailableReasons.push(`${e.name} — VAC; marks up ${NEXT_DAY[day]} 00:01`); continue; }
      if(e.reliefDay===day && !holdHasEnded(e,current)){ unavailableReasons.push(`${e.name} — RELIEF; normal markup ${NEXT_DAY[day]} ${e.markupTime}`); continue; }

      if(until>current){
        unavailableReasons.push(`${e.name} — ${statusLabel || "RESTING / OUT"}; available ${fmtAbs(until)}`);
        continue;
      }
    }

    return {boardRows,unavailableReasons};
  }

  function appendBoardSections(lines,board,day,current,availability,label="Ending Board Order",statusByEmployee={}){
    const s=boardSections(board,day,current,availability,statusByEmployee);
    lines.push(`${label}:`);
    if(s.boardRows.length) s.boardRows.forEach((n,i)=>lines.push(`${i+1}. ${n}`));
    else lines.push("- None currently available on board");

    if(s.unavailableReasons.length){
      lines.push("");
      lines.push("Unavailable:");
      s.unavailableReasons.forEach(x=>lines.push(`- ${x}`));
    }
  }

  function processDayStartMarkups(board,day,availability,lines,statusByEmployee={}){
    const prev=PREV_DAY[day], moved=new Set();
    const todayVac=new Set(state.extraVacations.filter(v=>v.day===day).map(v=>v.name));
    for(const name of todayVac){
      availability[name]=Math.max(availability[name]||0,(DAY_INDEX[day]+1)*1440+1);
      statusByEmployee[name]={label:"VAC"};
    }

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
      const bm=blockMarkupForDay(e.name,day);
      if(bm!==null && !moved.has(e.name)){
        if(moveToBottom(board,e.name)){
          const rested=bm+480;
          moved.add(e.name);
          availability[e.name]=Math.max(availability[e.name]||0,rested);
          lines.push(`  markup ${e.name}: block training ended ${fmtAbs(bm)}; available after 8h rest at ${fmtAbs(rested)}; moved to bottom`);
        }
      }
    }

    for(const e of [...board]){
      const holdReturn=e.holdReturnAbs ?? Infinity;
      if(Number.isFinite(holdReturn) && holdReturn>=DAY_INDEX[day]*1440 && holdReturn<DAY_INDEX[day]*1440+1440 && !moved.has(e.name)){
        if(moveToBottom(board,e.name)){
          moved.add(e.name);
          availability[e.name]=Math.max(availability[e.name]||0,holdReturn);
          e.holdDownRegular=null;
          lines.push(`  markup ${e.name}: hold-down ended ${fmtAbs(holdReturn)}; moved to bottom`);
        }
      }
    }

    for(const e of [...board]){
      if(e.reliefDay===prev && !moved.has(e.name)){
        if(todayVac.has(e.name)){ lines.push(`  hold ${e.name}: relief ended ${day} ${e.markupTime}, but vacation today; not marking up until ${NEXT_DAY[day]} 00:01`); continue; }
        if(isHoldActive(e,DAY_INDEX[day]*1440)){ continue; }
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

  function callNext(board,day,job,start,returnStart,returnEnd,availability,lines,rideHomeOnly=false){
    const next=NEXT_DAY[day];
    const skipReasons=[];
    const turn=turnName(job);

    // Manual double-out/rest override is a FORCE assignment.
    // It applies even if the normal board would have assigned somebody else.
    // This lets the sim model small-base weirdness and caller/crew-desk exceptions.
    const override=state.doubleOuts.find(d=>d.day===day && (d.turn==="Any" || d.turn===turn));
    if(override){
      const employee=board.find(e=>e.name===override.employee) || EXTRA_START.find(e=>e.name===override.employee);
      if(employee){
        const availableAt=availability[employee.name]||0;
        const conflict=start<availableAt
          ? `Conflict: ${employee.name} available ${fmtAbs(availableAt)}, job starts ${fmtAbs(start)}.`
          : "Manual override used.";

        const idx=board.findIndex(e=>e.name===employee.name);
        let called=employee;
        if(idx>=0){
          [called]=board.splice(idx,1);
          board.push(called);
        }else{
          board.push(employee);
          called=employee;
          moveToBottom(board,employee.name);
        }

        lines.push(`  DOUBLE-OUT / REST OVERRIDE: ${employee.name} forced onto ${turn}. ${conflict}`);
        const rest=rideHomeOnly ? 0 : requiredRestMinutes(returnStart,returnEnd);
        availability[employee.name]=returnEnd+rest;
        lines.push(rideHomeOnly
          ? `  ${employee.name} rides home / not working return; available at tie-up ${fmtAbs(availability[employee.name])}`
          : `  ${employee.name} next available after forced double-out/rest (${rest/60}h rest) at ${fmtAbs(availability[employee.name])}`);
        if(job.tieUpLocation && job.tieUpLocation!=="SPK") lines.push(`  WARNING: ${employee.name} ties up at ${job.tieUpLocation}, not SPK. Manual DHE/replacement may be needed before protecting another SPK job.`);
        return {called,double:true,skipReasons};
      }
    }

    for(const employee of [...board]){
      const idx=board.findIndex(e=>e.name===employee.name);
      if(isHoldActive(employee,start)){ const r=`${employee.name}: N/A holding down ${employee.holdDownRegular}${Number.isFinite(employee.holdReturnAbs)?`; marks up ${fmtAbs(employee.holdReturnAbs)}`:""}`; lines.push(`  skip ${r}`); skipReasons.push(r); continue; }
      const blockRested=blockRestedTimeAbs(employee.name,start);
      if(blockRested!==null){ const r=`${employee.name}: block training/rest until ${fmtAbs(blockRested)}`; lines.push(`  skip ${r}`); skipReasons.push(r); continue; }
      if(employee.reliefDay===day && !state.workRelief[employee.name]){ const r=`${employee.name}: job starts on relief day and Work Relief is not checked`; lines.push(`  skip ${r}`); skipReasons.push(r); continue; }
      if(isExtraVacation(employee.name,day)){ const r=`${employee.name}: vacation day`; lines.push(`  skip ${r}`); skipReasons.push(r); continue; }
      if(returnEnd>DAY_INDEX[next]*1440 && isExtraVacation(employee.name,next)){ const r=`${employee.name}: trip works into ${next}, but ${employee.name} has vacation`; lines.push(`  skip ${r}`); skipReasons.push(r); continue; }
      const blockStartHit=blockStartConflict(employee.name,returnEnd);
      if(blockStartHit){ const r=`${employee.name}: would not have 8h rest before block starts ${fmtAbs(blockStartHit.start)}`; lines.push(`  skip ${r}`); skipReasons.push(r); continue; }
      if(start<(availability[employee.name]||0)){ const r=`${employee.name}: not available until ${fmtAbs(availability[employee.name])}`; lines.push(`  skip ${r}`); skipReasons.push(r); continue; }

      const [called]=board.splice(idx,1);
      board.push(called);

      if(rideHomeOnly){
        availability[called.name]=returnEnd;
        lines.push(`  ${called.name} rides home / not working return; available at tie-up ${fmtAbs(availability[called.name])}`);
      }else if(returnEnd>DAY_INDEX[next]*1440 && called.reliefDay===next && !state.workRelief[called.name]){
        availability[called.name]=returnEnd+1440;
        lines.push(`  ${called.name} works into relief day ${next}; marks up 24h after return tie-up at ${fmtAbs(availability[called.name])}`);
      }else{
        const rest=requiredRestMinutes(returnStart,returnEnd);
        availability[called.name]=returnEnd+rest;
        lines.push(`  ${called.name} next available after return/rest (${rest/60}h rest) at ${fmtAbs(availability[called.name])}`);
      }
      if(job.tieUpLocation && job.tieUpLocation!=="SPK") lines.push(`  WARNING: ${called.name} ties up at ${job.tieUpLocation}, not SPK. Manual DHE/replacement may be needed before protecting another SPK job.`);
      return {called,double:false,skipReasons};
    }

    return {called:null,double:false,skipReasons};
  }

  function buildVacancyOverview(){
    const lines=[];
    lines.push("#".repeat(80),"WEEKLY VACANCY / ABSENCE SUMMARY","#".repeat(80));

    const holdEntries=Object.entries(state.fullWeekVacations);
    lines.push("Full-week vacations / hold-downs:");
    if(holdEntries.length){
      holdEntries.forEach(([regular,e])=>lines.push(`- ${regular}: ${holdExtra(e)==="None" ? "vacation, no hold-down" : `${holdExtra(e)} holding down`} (${shortDays(holdDays(regular,e))})${holdExtra(e)!=="None"?`; ${holdReturnLabel(e)}`:""}`));
    }else lines.push("- None");

    lines.push("","Single-day regular vacancies:");
    if(state.singleRegularVacancies.length) state.singleRegularVacancies.forEach(v=>lines.push(`- ${v.day}: ${v.regular}`)); else lines.push("- None");

    lines.push("","Extra-board vacations:");
    if(state.extraVacations.length) state.extraVacations.forEach(v=>lines.push(`- ${v.day}: ${v.name}`)); else lines.push("- None");

    lines.push("","Block training:");
    if(state.blockTraining.length) state.blockTraining.forEach(b=>lines.push(`- ${b.employee}: ${b.startDay} ${b.startTime||"08:00"} through ${b.endDay}; markup ${b.markupDay} ${b.markupTime}${b.notes?` (${b.notes})`:""}`)); else lines.push("- None");

    lines.push("","Extra jobs / DHE:");
    if(state.pinups.length) state.pinups.forEach(p=>{
      if(p.type==="DHE"){
        const d=routeDefaults(p.route);
        const mode=p.dheMode==="COVER_VACANCY" ? "cover open vacancy" : "return replacement";
        lines.push(`- ${p.day}: DHE ${mode} to ${p.route} / protect ${p.route} ${d.turn} | call ${p.onDuty} | away off ${p.awayTieUp || d.awayTieUp} | return tie-up ${d.returnTieUp}`);
      }else{
        lines.push(`- ${p.day}: ${p.label} ON ${p.onDuty} OFF ${p.offDuty}`);
      }
    }); else lines.push("- None");

    lines.push("","Canceled trains / turns:");
    if(state.canceledTrains.length) state.canceledTrains.forEach(c=>lines.push(`- ${c.day}: CANCEL ${c.target}${c.notes?` — ${c.notes}`:""}`)); else lines.push("- None");

    lines.push("","Manual double-outs / rest overrides:");
    if(state.doubleOuts.length) state.doubleOuts.forEach(d=>lines.push(`- ${d.employee}: ${d.day} ${d.regular} / ${d.turn}`)); else lines.push("- None");

    lines.push("");
    return lines;
  }

  function buildSimulation(actualOverrides={}, adjusted=false){
    const lines=[], employeeSummary={}, dailySummary=Object.fromEntries(DAYS.map(d=>[d,[]])), availability={}, workedJobs=[];
    const statusByEmployee={};
    const canceledLog=Object.fromEntries(DAYS.map(d=>[d,[]]));
    const board=state.boardOrder.filter(n=>n!=="N/A").map(name=>{
      const base=EXTRA_START.find(e=>e.name===name);
      return {...base,markupTime:state.markupTimes[name]||base.markupTime,holdDownRegular:null};
    });

    for(const [regular,value] of Object.entries(state.fullWeekVacations)){
      const extra=holdExtra(value);
      if(extra!=="None"){
        const e=board.find(x=>x.name===extra);
        if(e){
          e.holdDownRegular=regular;
          e.holdReturnAbs=holdReturnAbs(value);
        }
      }
    }

    lines.push(adjusted ? "ACTUAL BOARD REPLAY / ADJUSTED SIMULATION" : "RAILROAD EXTRA BOARD WEEKLY SIMULATION","=".repeat(80),"Jobs are modeled as complete turns: outbound plus return trip home.","Auto rest rule: return leg under 12h = 8h rest; return leg 12h or more = 10h rest", adjusted ? "Edited actual return tie-ups override later board calculations, relief 24-hour markups, and later job eligibility." : "");
    lines.push("", ...buildVacancyOverview());
    lines.push("Starting board:");
    board.forEach((e,i)=>lines.push(`${i+1}. ${e.name}${e.holdDownRegular?` — N/A holding down ${e.holdDownRegular}`:""}`));
    lines.push("");

    const vacanciesByDay=Object.fromEntries(DAYS.map(d=>[d,[]]));

    for(const [regular,value] of Object.entries(state.fullWeekVacations)){
      const extra=holdExtra(value);
      for(const day of holdDays(regular,value)){
        for(const job of jobsForRegularOnDay(regular,day)){
          const cancel=cancellationFor(day,job,regular,state.canceledTrains);
          if(cancel){ canceledLog[day].push(`CANCELED ${turnName(job)} for ${regular}${cancel.notes?` — ${cancel.notes}`:""}`); continue; }
          vacanciesByDay[day].push({day,regular,job,reason:"Hold-down / week vacation",holdDown:extra});
        }
      }
    }

    for(const vac of state.singleRegularVacancies){
      for(const job of jobsForRegularOnDay(vac.regular,vac.day)){
        const cancel=cancellationFor(vac.day,job,vac.regular,state.canceledTrains);
        if(cancel){ canceledLog[vac.day].push(`CANCELED ${turnName(job)} for ${vac.regular}${cancel.notes?` — ${cancel.notes}`:""}`); continue; }
        vacanciesByDay[vac.day].push({day:vac.day,regular:vac.regular,job,reason:"Single-day vacation",holdDown:"None"});
      }
    }

    for(const b of state.blockTraining.filter(x=>regulars.includes(x.employee))){
      // Check the whole week because a late block-training markup can make a later regular job illegal
      // even if the selected block day range has technically ended.
      for(const day of DAYS){
        for(const job of jobsForRegularOnDay(b.employee,day)){
          const {start}=jobStartEndAbs(day,job);
          const rested=blockRestedTimeAbs(b.employee,start);
          if(rested===null) continue;

          const exists=vacanciesByDay[day].some(v=>v.regular===b.employee && v.job.pool===job.pool && v.job.turn===job.turn);
          if(!exists){
            const cancel=cancellationFor(day,job,b.employee,state.canceledTrains);
            if(cancel){ canceledLog[day].push(`CANCELED ${turnName(job)} for ${b.employee}${cancel.notes?` — ${cancel.notes}`:""}`); continue; }
            vacanciesByDay[day].push({
              day,
              regular:b.employee,
              job,
              reason:`Block Training — available after 8h rest ${fmtAbs(rested)}${b.notes?` — ${b.notes}`:""}`,
              holdDown:"None"
            });
          }
        }
      }
    }

    for(const p of state.pinups){
      if(p.type==="DHE") continue;
      const job={regular:"PIN-UP",pool:"PIN-UP",turn:p.label,train:p.label,works:[p.day],onDuty:p.onDuty,offDuty:p.offDuty};
      const cancel=cancellationFor(p.day,job,"PIN-UP",state.canceledTrains);
      if(cancel){ canceledLog[p.day].push(`CANCELED PIN-UP ${p.label}${cancel.notes?` — ${cancel.notes}`:""}`); continue; }
      vacanciesByDay[p.day].push({day:p.day,regular:"PIN-UP",job,reason:"Pin-up / extra-board job",holdDown:"None"});
    }

    // DHE entries now use an explicit user-selected mode:
    // RETURN_REPLACEMENT = create a separate DHE job; original employee rides home / not working.
    // COVER_VACANCY = replace the outbound side of a matching open vacancy, otherwise create standalone DHE.
    for(const p of state.pinups.filter(x=>x.type==="DHE")){
      const clean=String(p.route||"PSC").replace(/ Relief$/,"");
      const d=routeDefaults(clean);
      const mode=p.dheMode || "RETURN_REPLACEMENT";

      if(mode==="RETURN_REPLACEMENT"){
        vacanciesByDay[p.day].push(makeStandaloneDheVacancy(
          p,
          clean,
          d,
          `DHE replacement to protect return ${clean} ${d.returnTrain}; original employee rides home / not working`
        ));
        continue;
      }

      let matched=false;
      for(const v of vacanciesByDay[p.day]){
        const vClean=String(v.job.pool||"").replace(/ Relief$/,"");
        if(vClean===clean && v.regular!=="PIN-UP"){
          v.job={...v.job,
            isDhe:true,
            dheTo:clean,
            outboundTrain:"DHE",
            onDuty:p.onDuty || v.job.onDuty,
            offDuty:p.awayTieUp || d.awayTieUp,
            returnOnDuty:d.returnOnDuty,
            returnTieUp:d.returnTieUp,
            tieUpLocation:"SPK"
          };
          v.reason=`${v.reason}; DHE to ${clean} instead of outbound ${d.outboundTrain}, return on ${d.returnTrain}`;
          matched=true;
        }
      }

      if(!matched){
        vacanciesByDay[p.day].push(makeStandaloneDheVacancy(
          p,
          clean,
          d,
          `DHE to ${clean} to protect return ${clean} ${d.returnTrain}`
        ));
      }
    }

    for(const day of DAYS){ vacanciesByDay[day].sort((a,b)=>jobStartEndAbs(day,a.job).start-jobStartEndAbs(day,b.job).start); }

    for(const day of DAYS){
      lines.push("=".repeat(80),day.toUpperCase(),"=".repeat(80));
      processDayStartMarkups(board,day,availability,lines,statusByEmployee);
      appendBoardSections(lines,board,day,DAY_INDEX[day]*1440,availability,"Starting Board Order",statusByEmployee);
      lines.push("");

      const jobs=vacanciesByDay[day];
      if(canceledLog[day].length){
        lines.push("Canceled / removed jobs:");
        canceledLog[day].forEach(x=>lines.push(`- ${x}`));
        lines.push("");
      }
      if(!jobs.length) lines.push("Open jobs: none");
      else{
        lines.push("Open jobs:");
        for(const v of jobs){
          const {start}=jobStartEndAbs(day,v.job), retStart=returnTripStartAbs(day,v.job);
          const id=eventIdFor(day,v.job,v.regular);
          const plannedRet=returnTripEndAbs(day,v.job);
          const override=actualOverrides[id];
          const ret=(override && typeof override==="object" ? override.return : override) ?? plannedRet;
          const plannedAwayAbs=v.job.pool==="PIN-UP" ? null : (DAY_INDEX[day]*1440+parseTime(v.job.offDuty));
          const awayOverride=(override && typeof override==="object" ? override.away : null);
          const actualAwayAbs=awayOverride ?? plannedAwayAbs;
          const awayWarn=(actualAwayAbs && actualAwayAbs+480>retStart) ? ` | WARNING: not rested for return, rested ${fmtAbs(actualAwayAbs+480)}` : "";
          if(v.regular==="PIN-UP"){
            lines.push(`- PIN-UP ${v.job.train} | ${v.reason} | ON ${fmtAbs(start)} OFF/RETURN ${fmtAbs(ret)}`);
          }else if(v.job.isDhe){
            const awayAbs=actualAwayAbs ?? (DAY_INDEX[day]*1440+parseTime(v.job.offDuty));
            lines.push(`- DHE to ${v.job.dheTo} / return ${v.job.pool} ${v.job.returnTrain} | ${v.regular} off | ${v.reason} | DHE CALL ${fmtAbs(start)} AWAY OFF ${fmtAbs(awayAbs)} RETURN TIE-UP ${fmtAbs(ret)}${awayWarn}`);
          }else if(v.job.manualJobType){
            lines.push(`- ${v.job.manualJobType}: ${turnName(v.job)} | ${v.regular} | ${v.reason} | ON/DHE ${fmtAbs(start)} RETURN ON ${fmtAbs(retStart)} TIE-UP ${fmtAbs(ret)}${v.job.tieUpLocation?` at ${v.job.tieUpLocation}`:""}`);
          }else{
            lines.push(`- ${turnName(v.job)} | ${v.regular} off | ${v.reason} | OUTBOUND ON ${fmtAbs(start)} AWAY OFF ${fmtAbs(actualAwayAbs)} RETURN ON ${fmtAbs(retStart)} RETURN TIE-UP ${fmtAbs(ret)}${awayWarn}`);
          }
        }

        lines.push("","Assignments:");
        for(const v of jobs){
          const {start}=jobStartEndAbs(day,v.job), returnStart=returnTripStartAbs(day,v.job);
          const id=eventIdFor(day,v.job,v.regular);
          const plannedRet=returnTripEndAbs(day,v.job);
          const override=actualOverrides[id];
          const ret=(override && typeof override==="object" ? override.return : override) ?? plannedRet;
          const plannedAwayAbs=v.job.pool==="PIN-UP" ? null : (DAY_INDEX[day]*1440+parseTime(v.job.offDuty));
          const awayOverride=(override && typeof override==="object" ? override.away : null);
          const actualAwayAbs=awayOverride ?? plannedAwayAbs;
          const awayWarn=(actualAwayAbs && actualAwayAbs+480>returnStart) ? ` | AWAY REST WARNING: not rested for return until ${fmtAbs(actualAwayAbs+480)}` : "";

          if(v.holdDown!=="None"){
            const holdBlockConflict=blockStartConflict(v.holdDown,ret);
            const text=`${v.holdDown} works ${v.job.isDhe?`DHE to ${v.job.dheTo} / return ${v.job.pool} ${v.job.returnTrain}`:`${turnName(v.job)} turn`} holding down ${v.regular} | OUTBOUND/DHE ON ${fmtAbs(start)}${actualAwayAbs?` AWAY OFF ${fmtAbs(actualAwayAbs)}`:""} RETURN TIE-UP ${fmtAbs(ret)}${awayWarn}${holdBlockConflict?` | BLOCK REST CONFLICT: block starts ${fmtAbs(holdBlockConflict.start)}`:""}`;
            lines.push(`- ${text}`);
            if(awayWarn) lines.push(`  WARNING: ${v.holdDown} would not have 8h rest before return on-duty ${fmtAbs(returnStart)}.`);
            if(holdBlockConflict) lines.push(`  WARNING: ${v.holdDown} would not have 8h rest before block starts ${fmtAbs(holdBlockConflict.start)}.`);
            dailySummary[day].push(text);
            employeeSummary[v.holdDown]=[...(employeeSummary[v.holdDown]||[]),`${day.slice(0,3)} ${turnName(v.job)}`];
            statusByEmployee[v.holdDown]={kind:"WORKING", until:ret, label:`HOLD-DOWN / WORKING ${turnName(v.job)} for ${v.regular}`};
            workedJobs.push({
              id,
              employee:v.holdDown, day, pool:v.job.pool, train:v.job.turn,
              status:"ASSIGNED",
              reason:"",
              startAbs:start, returnStartAbs:returnStart, plannedReturnAbs:plannedRet, actualReturnAbs:ret,
              plannedAwayAbs,
              actualAwayAbs,
              label:actualTieUpLabel(v.holdDown,day,v.job,v.regular,true),
              plannedAway: plannedAwayAbs ? fmtAbs(plannedAwayAbs) : null,
              actualAway: actualAwayAbs ? fmtAbs(actualAwayAbs) : null,
              plannedReturn:fmtAbs(plannedRet), actualReturn:fmtAbs(ret)
            });
            continue;
          }

          const rideHomeOnly=!!awayWarn && !v.job.isDhe;
          const callResult=callNext(board,day,v.job,start,returnStart,ret,availability,lines,rideHomeOnly);
          const called=callResult.called;
          const isDouble=callResult.double;
          let text;

          if(!called){
            text=v.regular==="PIN-UP"
              ? `UNFILLED — no rested/available extra-board employee for ${v.job.train} pin-up`
              : `UNFILLED — no rested/available extra-board employee for ${v.job.isDhe ? `DHE to ${v.job.dheTo} / return ${v.job.returnTrain}` : `${turnName(v.job)} covering ${v.regular}`}`;
            if(callResult.skipReasons?.length){ lines.push("  Reasons:"); callResult.skipReasons.forEach(r=>lines.push(`   - ${r}`)); }

            workedJobs.push({
              id,
              employee:"UNFILLED",
              day,
              pool:v.job.pool,
              train:v.job.turn || v.job.train,
              status:"UNFILLED",
              reason:callResult.skipReasons?.join("; ") || "no rested/available extra-board employee",
              startAbs:start,
              returnStartAbs:returnStart,
              plannedAwayAbs,
              actualAwayAbs,
              plannedReturnAbs:plannedRet,
              actualReturnAbs:ret,
              label:v.regular==="PIN-UP"
                ? `UNFILLED ${day.slice(0,3)} PIN-UP ${v.job.train}`
                : `UNFILLED ${day.slice(0,3)} ${turnName(v.job)} for ${v.regular}`,
              plannedAway: plannedAwayAbs ? fmtAbs(plannedAwayAbs) : null,
              actualAway: actualAwayAbs ? fmtAbs(actualAwayAbs) : null,
              plannedReturn:fmtAbs(plannedRet),
              actualReturn:fmtAbs(ret)
            });
          }else if(v.regular==="PIN-UP"){
            text=`${called.name}${isDouble?" DOUBLE-OUT / REST OVERRIDE":""} works pin-up ${v.job.train} | ON ${fmtAbs(start)} OFF ${fmtAbs(ret)}`;
            employeeSummary[called.name]=[...(employeeSummary[called.name]||[]),`${day.slice(0,3)} PIN-UP ${v.job.train}`];
            statusByEmployee[called.name]={kind:"WORKING", until:ret, label:`${isDouble?"DOUBLE-OUT / ":""}WORKING PIN-UP ${v.job.train}`};
            workedJobs.push({
              id,
              employee:called.name, day, pool:"PIN-UP", train:v.job.train,
              status:isDouble ? "DOUBLE-OUT" : "ASSIGNED",
              reason:isDouble ? `REST OVERRIDE: forced assignment; job starts ${fmtAbs(start)}` : "",
              startAbs:start, returnStartAbs:returnStart, plannedReturnAbs:plannedRet, actualReturnAbs:ret,
              label:isDouble ? `${called.name} DOUBLE-OUT ${day.slice(0,3)} PIN-UP ${v.job.train}` : actualTieUpLabel(called.name,day,v.job),
              plannedAway: null,
              actualAway: null,
              plannedReturn:fmtAbs(plannedRet), actualReturn:fmtAbs(ret)
            });
          }else{
            const manual=v.job.manualJobType;
            text=v.job.isDhe
              ? `${called.name}${isDouble?" DOUBLE-OUT / REST OVERRIDE":""} works DHE to ${v.job.dheTo} / return ${v.job.pool} ${v.job.returnTrain}${v.regular && v.regular!=="DHE" ? ` for ${v.regular}` : ""} | DHE CALL ${fmtAbs(start)} AWAY OFF ${fmtAbs(actualAwayAbs)} RETURN TIE-UP ${fmtAbs(ret)}${awayWarn}`
              : manual
                ? `${called.name}${isDouble?" DOUBLE-OUT / REST OVERRIDE":""} works ${manual}: ${turnName(v.job)} | ON/DHE ${fmtAbs(start)}${actualAwayAbs?` AWAY OFF ${fmtAbs(actualAwayAbs)}`:""} TIE-UP ${fmtAbs(ret)}${v.job.tieUpLocation?` at ${v.job.tieUpLocation}`:""}${awayWarn}`
                : rideHomeOnly
                  ? `${called.name}${isDouble?" DOUBLE-OUT / REST OVERRIDE":""} works outbound ${turnName(v.job)} for ${v.regular} | OUTBOUND ON ${fmtAbs(start)} AWAY OFF ${fmtAbs(actualAwayAbs)} | RIDES RETURN / NOT WORKING | TIE-UP ${fmtAbs(ret)}${awayWarn}`
                  : `${called.name}${isDouble?" DOUBLE-OUT / REST OVERRIDE":""} works ${turnName(v.job)} turn for ${v.regular} | OUTBOUND ON ${fmtAbs(start)} AWAY OFF ${fmtAbs(actualAwayAbs)} RETURN TIE-UP ${fmtAbs(ret)}${awayWarn}`;
            employeeSummary[called.name]=[...(employeeSummary[called.name]||[]),`${day.slice(0,3)} ${v.job.isDhe?`DHE ${v.job.dheTo} / return ${v.job.returnTrain}`:manual?manual+" "+turnName(v.job):turnName(v.job)}`];
            statusByEmployee[called.name]={kind:"WORKING", until:ret, label:`${isDouble?"DOUBLE-OUT / ":""}${rideHomeOnly?`RIDING RETURN / NOT WORKING ${turnName(v.job)} for ${v.regular}`:v.job.isDhe?`WORKING DHE to ${v.job.dheTo} / return ${v.job.returnTrain}`:manual?`WORKING ${manual} ${turnName(v.job)}`:`WORKING ${turnName(v.job)} for ${v.regular}`}`};
            workedJobs.push({
              id,
              employee:called.name, day, pool:v.job.pool, train:v.job.turn,
              status:isDouble ? "DOUBLE-OUT" : "ASSIGNED",
              reason:isDouble ? `REST OVERRIDE: forced assignment; job starts ${fmtAbs(start)}` : (v.job.tieUpLocation&&v.job.tieUpLocation!=="SPK" ? `WARNING: ties up away at ${v.job.tieUpLocation}` : ""),
              startAbs:start, returnStartAbs:returnStart, plannedReturnAbs:plannedRet, actualReturnAbs:ret,
              plannedAwayAbs,
              actualAwayAbs,
              label:isDouble ? `${called.name} DOUBLE-OUT ${day.slice(0,3)} ${turnName(v.job)} for ${v.regular}` : actualTieUpLabel(called.name,day,v.job,v.regular,false),
              plannedAway: plannedAwayAbs ? fmtAbs(plannedAwayAbs) : null,
              actualAway: actualAwayAbs ? fmtAbs(actualAwayAbs) : null,
              plannedReturn:fmtAbs(plannedRet), actualReturn:fmtAbs(ret)
            });
          }

          lines.push(`- ${text}`);
          if(awayWarn) lines.push(`  WARNING: ${called?.name || "employee"} would not have 8h rest before return on-duty ${fmtAbs(returnStart)}; treat return as ride-home/not working and create DHE replacement.`);
          dailySummary[day].push(text);
        }
      }

      if(canceledLog[day].length){
        canceledLog[day].forEach(x=>dailySummary[day].push(x));
      }

      lines.push("");
      appendBoardSections(lines,board,day,DAY_INDEX[day]*1440,availability,"Ending Board Order",statusByEmployee);
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

    lines.push("","#".repeat(80),"FINAL END-OF-WEEK BOARD ORDER","#".repeat(80));
    const weekEnd=7*1440;
    const finalSections=boardSections(board,"Sunday",weekEnd,availability,statusByEmployee);
    if(finalSections.boardRows.length) finalSections.boardRows.forEach((n,i)=>lines.push(`${i+1}. ${n}`)); else lines.push("- None currently available on board");
    if(finalSections.unavailableReasons.length){ lines.push(""); lines.push("Unavailable:"); finalSections.unavailableReasons.forEach(x=>lines.push(`- ${x}`)); }

    return { text: lines.join("\n"), workedJobs };
  }

  function applySavedEditsToCards(cards){
    return cards.map(j=>{
      const edit=actualEdits[j.id];
      if(!edit) return j;
      return {
        ...j,
        actualReturn:editReturnValue(edit) || j.actualReturn,
        actualAway:editAwayValue(edit) || j.actualAway
      };
    });
  }

  function runSimulation(){
    const out=buildSimulation();
    setResult(out.text);
    setActualJobs(applySavedEditsToCards(out.workedJobs));
    setActualResult("");
    setSummaryMode("Planned");
  }

  function recalcActualSummary(){
    if(!actualJobs.length){ alert("Run the planned simulation first."); return; }
    try{
      const overrides={};
      for(const j of actualJobs){
        let returnAbs=j.plannedReturnAbs;
        let awayAbs=j.plannedAwayAbs || null;
        try{ returnAbs=parseActualReturnForJob(j,j.actualReturn || j.plannedReturn); }catch{}
        try{ awayAbs=j.plannedAway ? parseActualAwayForJob(j,j.actualAway || j.plannedAway) : null; }catch{}
        overrides[j.id]={
          return:returnAbs,
          away:awayAbs
        };
      }

      const out=buildSimulation(overrides,true);
      setResult(out.text);
      setActualResult("");
      setSummaryMode("Actual / Adjusted Board Replay");

      // Rebuild cards from the adjusted replay, then sort by true absolute return time.
      // This keeps Sunday jobs tying up Monday at the end of the week instead of the top.
      const adjustedCards=out.workedJobs
        .map(j=>({
          ...j,
          actualReturn:editReturnValue(actualEdits[j.id]) || fmtAbs(j.actualReturnAbs ?? overrides[j.id]?.return ?? j.plannedReturnAbs),
          actualAway:editAwayValue(actualEdits[j.id]) || (j.actualAwayAbs ? fmtAbs(j.actualAwayAbs) : j.actualAway),
        }))
        .sort((a,b)=>(a.actualReturnAbs ?? parseActualReturnForJob(a,a.actualReturn))-(b.actualReturnAbs ?? parseActualReturnForJob(b,b.actualReturn)));

      setActualJobs(adjustedCards);
    }catch(e){ alert(e.message); }
  }

  function downloadSummary(){
    const combined=result||"Run the simulation first.";
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
    setActualEdits({});
    setActualResult("");
    setSummaryMode("Planned");
  }

  function addHoldDown(){
    const regular=document.getElementById("holdRegular").value;
    const extra=document.getElementById("holdExtra").value;
    const days=holdDaySelection.length ? holdDaySelection : allWorkingDaysForRegular(regular);
    const returnMode=document.getElementById("holdReturnMode").value;
    const holdMarkupDay=document.getElementById("holdMarkupDay").value;
    const holdMarkupTime=document.getElementById("holdMarkupTime").value||"00:01";
    try{parseTime(holdMarkupTime);}catch{alert("Bad hold-down markup time.");return;}
    update({fullWeekVacations:{...state.fullWeekVacations,[regular]:{extra,days,holdContinues:returnMode==="continues",holdMarkupDay,holdMarkupTime}}});
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
    const type=extraJobType;
    const day=document.getElementById("pinupDay").value;
    const label=document.getElementById("pinupLabel")?.value||"Yard Switching";
    const onDuty=document.getElementById("pinupOn").value||"23:30";
    const offDuty=document.getElementById("pinupOff").value||"03:30";
    const route=document.getElementById("pinupRoute")?.value||"PSC";
    const dheMode=document.getElementById("pinupDheMode")?.value||"RETURN_REPLACEMENT";
    const d=routeDefaults(route);
    const returnTieUp=d.returnTieUp;
    try{parseTime(onDuty);parseTime(offDuty);parseTime(returnTieUp);}catch{alert("Bad extra job/DHE time. Use 08:00, 2030, 22:15, etc.");return;}
    if(type==="DHE"){
      update({pinups:[...state.pinups,{type:"DHE",day,route,label,onDuty,awayTieUp:offDuty,returnTieUp,dheMode}]});
    }else{
      update({pinups:[...state.pinups,{type:"PINUP",day,label,onDuty,offDuty}]});
    }
  }
  function addCancelTrain(){
    const day=document.getElementById("cancelDay").value;
    const target=document.getElementById("cancelTarget").value;
    const notes=document.getElementById("cancelNotes").value||"";
    update({canceledTrains:[...state.canceledTrains,{day,target,notes}]});
  }

  function setCreatedDefaults(){
    const pool=document.getElementById("createPool")?.value || "PSC";
    const type=document.getElementById("createMovementType")?.value || "Add return train";
    const d=routeDefaults(pool);
    const turnEl=document.getElementById("createTurn");
    const toEl=document.getElementById("createDeadheadTo");
    const awayEl=document.getElementById("createAwayTie");
    const onEl=document.getElementById("createOn");
    const returnOnEl=document.getElementById("createReturnOn");
    const tieEl=document.getElementById("createTie");
    const locEl=document.getElementById("createTieLocation");
    if(turnEl) turnEl.value=d.returnTrain;
    if(toEl && !toEl.value) toEl.value=d.terminal;
    if(awayEl) awayEl.value=d.awayTieUp;
    if(onEl && (type==="Add return train" || type==="DHE out + work return train")) onEl.value=d.awayTieUp;
    if(returnOnEl) returnOnEl.value=d.returnOnDuty;
    if(tieEl) tieEl.value=d.returnTieUp;
    if(locEl && type==="DHE home only") locEl.value="SPK";
  }

  function addCreatedTrain(){
    const day=document.getElementById("createDay").value;
    const movementType=document.getElementById("createMovementType").value;
    const pool=document.getElementById("createPool").value;
    const d=routeDefaults(pool);
    const turn=document.getElementById("createTurn").value||d.returnTrain;
    const deadheadFrom=document.getElementById("createDeadheadFrom").value||"SPK";
    const deadheadTo=document.getElementById("createDeadheadTo").value||d.terminal;
    const awayTieUp=document.getElementById("createAwayTie").value||d.awayTieUp;
    const onDuty=document.getElementById("createOn").value||awayTieUp;
    const returnOnDuty=document.getElementById("createReturnOn").value||d.returnOnDuty;
    const returnTieUp=document.getElementById("createTie").value||d.returnTieUp;
    const tieUpLocation=document.getElementById("createTieLocation").value||"SPK";
    const regular=document.getElementById("createRegular").value||"CREATED";
    const reason=document.getElementById("createReason").value||"Manual created job";
    const notes=document.getElementById("createNotes").value||"";
    try{parseTime(awayTieUp);parseTime(onDuty);parseTime(returnOnDuty);parseTime(returnTieUp);}catch{alert("Bad manual job/deadhead time.");return;}
    update({createdTrains:[...state.createdTrains,{day,movementType,pool,turn,deadheadFrom,deadheadTo,awayTieUp,onDuty,returnOnDuty,returnTieUp,tieUpLocation,regular,reason,notes}]});
  }

  function addExtraVacation(){
    const day=document.getElementById("extraVacDay").value, name=document.getElementById("extraVacName").value;
    if(state.extraVacations.some(v=>v.day===day&&v.name===name)){alert(`${name} is already marked off ${day}`);return;}
    update({extraVacations:[...state.extraVacations,{day,name}]});
  }
  function addBlockTraining(){
    const employee=document.getElementById("blockEmployee").value;
    const startDay=document.getElementById("blockStartDay").value;
    const startTime=document.getElementById("blockStartTime").value||"08:00";
    const endDay=document.getElementById("blockEndDay").value;
    const markupDay=document.getElementById("blockMarkupDay").value;
    const markupTime=document.getElementById("blockMarkupTime").value||"16:00";
    const notes=document.getElementById("blockNotes").value||"";
    try{parseTime(startTime);parseTime(markupTime);}catch{alert("Bad block start or markup time.");return;}
    update({blockTraining:[...state.blockTraining,{employee,startDay,startTime,endDay,markupDay,markupTime,notes}]});
  }
  function addDoubleOut(){
    const employee=document.getElementById("doubleEmployee").value;
    const day=document.getElementById("doubleDay").value;
    const turn=document.getElementById("doubleTurn").value;
    update({doubleOuts:[...state.doubleOuts,{employee,day,turn}]});
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
  function toggleSection(key){
    setOpenSections(s=>({...s,[key]:!s[key]}));
  }

  function sectionTitle(title,count){
    return count ? `${title} (${count})` : title;
  }

  function CollapseSection({id,title,count=0,children}){
    const open=!!openSections[id];
    return <div className={`subcard collapseSubcard ${open?"open":"closed"}`}>
      <button type="button" className="collapseHeader" onClick={()=>toggleSection(id)} aria-expanded={open}>
        <span className="chevron">{open?"▾":"▸"}</span>
        <span>{sectionTitle(title,count)}</span>
      </button>
      {open && <div className="collapseBody">{children}</div>}
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

        <CollapseSection id="startingBoard" title="Starting Board" count={state.boardOrder.filter(x=>x && x!=="N/A").length}>
          {state.boardOrder.map((name,i)=><label className="row" key={i}><span>Position {i+1}</span><select value={name} onChange={e=>{const copy=[...state.boardOrder];copy[i]=e.target.value;update({boardOrder:copy});}}>{["N/A",...extras].map(o=><option key={o}>{o}</option>)}</select></label>)}
        </CollapseSection>

        <CollapseSection id="reliefMarkup" title="Relief / Markup" count={EXTRA_START.length}>
          {EXTRA_START.map(e=><div className="reliefCard" key={e.name}>
            <div className="reliefTitle"><b>{e.name}</b><span>— relief day: {e.reliefDay}</span></div>
            <label className="row"><span>Markup</span><input value={state.markupTimes[e.name]||"00:01"} onChange={ev=>update({markupTimes:{...state.markupTimes,[e.name]:ev.target.value}})}/></label>
            <label className="check"><input type="checkbox" checked={!!state.workRelief[e.name]} onChange={ev=>update({workRelief:{...state.workRelief,[e.name]:ev.target.checked}})}/> May start job on relief day</label>
          </div>)}
        </CollapseSection>
      </section>

      <section className="card">
        <h2>Vacancies / Jobs</h2>
        <CollapseSection id="hold" title="Full-Week Vacation / Hold-Down" count={Object.keys(state.fullWeekVacations).length}>
          <label>Regular</label><select id="holdRegular">{regulars.map(r=><option key={r}>{r}</option>)}</select>
          <label>Extra taking hold-down</label><select id="holdExtra">{["None",...extras].map(x=><option key={x}>{x}</option>)}</select>
          <label>Hold-down days</label>
          <div className="dayButtons">{DAYS.map(day=><button key={day} type="button" className={holdDaySelection.includes(day)?"dayButton active":"dayButton"} onClick={()=>toggleHoldDay(day)}>{day.slice(0,3)}</button>)}</div>
          <small>Leave all days unselected to use the regular's normal work days.</small>
          <label>Hold-down return</label><select id="holdReturnMode"><option value="continues">Continues / no board return this week</option><option value="manual">Manual markup back to board</option></select>
          <label>Manual markup day</label><select id="holdMarkupDay">{DAYS.map(d=><option key={d}>{d}</option>)}</select>
          <label>Manual markup time</label><input id="holdMarkupTime" defaultValue="00:01"/>
          <small>Use manual markup when the hold-down ends and the extra-board employee returns to the board during this sim week.</small>
          <button onClick={addHoldDown}>Add / Update Hold-Down</button>
          <List items={Object.entries(state.fullWeekVacations).map(([r,e])=>`${r} → ${holdExtra(e)==="None"?"vacation, no hold-down":`${holdExtra(e)} hold-down`} (${shortDays(holdDays(r,e))})${holdExtra(e)!=="None"?`; ${holdReturnLabel(e)}`:""}`)} onRemove={idx=>removeHoldDown(Object.keys(state.fullWeekVacations)[idx])}/>
        

        </CollapseSection>

<CollapseSection id="single" title="Single-Day Regular Vacancy" count={state.singleRegularVacancies.length}>
          <label>Day</label><select id="singleDay">{DAYS.map(d=><option key={d}>{d}</option>)}</select>
          <label>Regular off</label><select id="singleRegular">{regulars.map(r=><option key={r}>{r}</option>)}</select>
          <button onClick={addRegularVacancy}>Add Regular Vacancy</button>
          <List items={state.singleRegularVacancies.map(v=>`${v.day} → ${v.regular}`)} onRemove={idx=>update({singleRegularVacancies:state.singleRegularVacancies.filter((_,i)=>i!==idx)})}/>
        

        </CollapseSection>

<CollapseSection id="extraJob" title="Extra Job / DHE" count={state.pinups.length}>
          <label>Job type</label>
          <select id="pinupType" value={extraJobType} onChange={e=>setExtraJobType(e.target.value)}>
            <option value="PINUP">Pin-up / extra job</option>
            <option value="DHE">DHE to protect turn</option>
          </select>

          <label>Day</label><select id="pinupDay">{DAYS.map(d=><option key={d}>{d}</option>)}</select>

          {extraJobType==="PINUP" ? <>
            <label>Job label</label><input id="pinupLabel" defaultValue="Yard Switching"/>
            <label>On duty</label><input id="pinupOn" defaultValue="23:30"/>
            <label>Off duty</label><input id="pinupOff" defaultValue="03:30"/>
            <small>If off time is earlier than on time, it ties up next day.</small>
          </> : <>
            <label>DHE type</label><select id="pinupDheMode" defaultValue="RETURN_REPLACEMENT">
              <option value="RETURN_REPLACEMENT">Return replacement / employee rides home</option>
              <option value="COVER_VACANCY">Cover open vacancy / DHE out, work return</option>
            </select>
            <label>DHE route / terminal</label><select id="pinupRoute">{["PSC","WEN","WFH"].map(x=><option key={x}>{x}</option>)}</select>
            <label>DHE note</label><input id="pinupLabel" defaultValue="DHE"/>
            <label>DHE call time</label><input id="pinupOn" defaultValue="06:44"/>
            <label>Away terminal off-duty</label><input id="pinupOff" defaultValue="06:44"/>
            <small>Return replacement creates a separate board job and the original employee rides home. Cover open vacancy replaces the outbound side of an open vacancy.</small>
          </>}

          <button onClick={addPinup}>{extraJobType==="DHE" ? "Add DHE" : "Add Pin-Up / Extra Job"}</button>
          <List items={state.pinups.map(p=>{
            if(p.type==="DHE"){
              const d=routeDefaults(p.route);
              const mode=p.dheMode==="COVER_VACANCY" ? "cover vacancy" : "return replacement";
              return `${p.day} → DHE ${mode} to ${p.route} / return ${d.returnTrain} CALL ${p.onDuty} AWAY OFF ${p.awayTieUp || d.awayTieUp} RETURN ${d.returnTieUp}`;
            }
            return `${p.day} → ${p.label} ON ${p.onDuty} OFF ${p.offDuty}`;
          })} onRemove={idx=>update({pinups:state.pinups.filter((_,i)=>i!==idx)})}/>
        

        </CollapseSection>

<CollapseSection id="cancels" title="Canceled Trains / Turns" count={state.canceledTrains.length}>
          <small>Use this for annulments, turned equipment, or trains that do not run. DHE moves now live under Extra Job / DHE.</small>

          <h4>Cancel Train / Turn</h4>
          <label>Day</label><select id="cancelDay">{DAYS.map(d=><option key={d}>{d}</option>)}</select>
          <label>Cancel target</label><select id="cancelTarget">{["Any","PSC 27/28","WEN 7/8","WEN Relief 7/8","WFH 8/7","WFH Relief 8/7","PSC Relief 27/28","PIN-UP Yard Switching"].map(x=><option key={x}>{x}</option>)}</select>
          <label>Notes / reason</label><input id="cancelNotes" placeholder="weather, turned set, maintenance, annulled, etc."/>
          <button onClick={addCancelTrain}>Add Cancellation</button>
          <List items={state.canceledTrains.map(c=>`${c.day} → CANCEL ${c.target}${c.notes?` (${c.notes})`:""}`)} onRemove={idx=>update({canceledTrains:state.canceledTrains.filter((_,i)=>i!==idx)})}/>
        

        </CollapseSection>

<CollapseSection id="extraVac" title="Extra Board Vacation" count={state.extraVacations.length}>
          <label>Day</label><select id="extraVacDay">{DAYS.map(d=><option key={d}>{d}</option>)}</select>
          <label>Extra employee</label><select id="extraVacName">{extras.map(x=><option key={x}>{x}</option>)}</select>
          <button onClick={addExtraVacation}>Add Extra Vacation</button>
          <List items={state.extraVacations.map(v=>`${v.day} → ${v.name}`)} onRemove={idx=>update({extraVacations:state.extraVacations.filter((_,i)=>i!==idx)})}/>
        

        </CollapseSection>

<CollapseSection id="block" title="Block Training" count={state.blockTraining.length}><small>Uses 8h rest before block start and 8h rest after block markup.</small>
          <label>Employee</label><select id="blockEmployee">{people.map(x=><option key={x}>{x}</option>)}</select>
          <label>Start day</label><select id="blockStartDay">{DAYS.map(d=><option key={d}>{d}</option>)}</select>
          <label>Start time</label><input id="blockStartTime" defaultValue="08:00"/>
          <label>End day</label><select id="blockEndDay">{DAYS.map(d=><option key={d}>{d}</option>)}</select>
          <label>Markup day</label><select id="blockMarkupDay">{DAYS.map(d=><option key={d}>{d}</option>)}</select>
          <label>Markup time</label><input id="blockMarkupTime" defaultValue="16:00"/>
          <label>Location / notes</label><input id="blockNotes" placeholder="Seattle, PDX, annual block, etc."/>
          <button onClick={addBlockTraining}>Add Block Training</button>
          <List items={state.blockTraining.map(b=>`${b.employee}: ${b.startDay} ${b.startTime||"08:00"}-${b.endDay}, markup ${b.markupDay} ${b.markupTime}${b.notes?` (${b.notes})`:""}`)} onRemove={idx=>update({blockTraining:state.blockTraining.filter((_,i)=>i!==idx)})}/>
        

        </CollapseSection>

<CollapseSection id="doubleOut" title="Manual Double-Out / Rest Override" count={state.doubleOuts.length}>
          <label>Employee</label><select id="doubleEmployee">{extras.map(x=><option key={x}>{x}</option>)}</select>
          <label>Day</label><select id="doubleDay">{DAYS.map(d=><option key={d}>{d}</option>)}</select>
          <label>Turn</label><select id="doubleTurn">{["Any","PSC 27/28","WEN 7/8","WEN Relief 7/8","WFH 8/7","WFH Relief 8/7","PSC Relief 27/28","PIN-UP Yard Switching"].map(x=><option key={x}>{x}</option>)}</select>
          <button onClick={addDoubleOut}>Add Double-Out Override</button>
          <List items={state.doubleOuts.map(d=>`${d.employee} DOUBLE-OUT on ${d.day}: ${d.turn}`)} onRemove={idx=>update({doubleOuts:state.doubleOuts.filter((_,i)=>i!==idx)})}/>
        
</CollapseSection>

      </section>

      <section className="card results">
        <div className="mobileActionRow">{actionButtons("bottomActions")}</div>

        <h2>Live Board Replay / Actual Tie-Ups</h2>
        <p className="empty">Run planned simulation first, then edit actual return tie-up times. UNFILLED jobs stay visible here. Add a Manual Double-Out / Rest Override, then press Recalculate Actual Board to force that employee onto a job and rebuild the board, even if the job was not unfilled.</p>
        {actualJobs.length?<div className="actualList">{actualJobs.map((job,idx)=><div className={`actualRow ${job.status==="UNFILLED"?"unfilledRow":job.status==="DOUBLE-OUT"?"doubleRow":""}`} key={job.id}>
          <div className="tileTitleLine">
            <label>{job.label}</label>
            {job.status && job.status!=="ASSIGNED" && <span className={`statusPill ${job.status==="UNFILLED"?"unfilledPill":"doublePill"}`}>{job.status}</span>}
          </div>
          {job.reason && <small className="tileReason">{job.reason}</small>}
          {job.plannedAway && <small>Planned away terminal off-duty: {job.plannedAway}</small>}
          {job.plannedAway && job.status!=="UNFILLED" && <>
            <label className="miniLabel">Actual away terminal off-duty</label>
            <input value={job.actualAway || job.plannedAway} onChange={ev=>{const value=ev.target.value;const copy=[...actualJobs];copy[idx]={...copy[idx],actualAway:value};setActualJobs(copy);setActualEdits(edits=>{const old=edits[job.id];const next=old&&typeof old==="object"?{...old}:{return:old||job.actualReturn};return {...edits,[job.id]:{...next,away:value}};});}}/>
            {awayRestWarning(job) && <div className="unfilledHint">{awayRestWarning(job)}</div>}
          </>}
          <small>Planned return tie-up / markup time: {job.plannedReturn}</small>
          {job.status==="UNFILLED"
            ? <div className="unfilledHint">Add a Manual Double-Out / Rest Override below, then press Recalculate Actual Board.</div>
            : <>
              <label className="miniLabel">Actual return tie-up / markup</label>
              <input value={job.actualReturn} onChange={ev=>{const value=ev.target.value;const copy=[...actualJobs];copy[idx]={...copy[idx],actualReturn:value};setActualJobs(copy);setActualEdits(edits=>{const old=edits[job.id];const next=old&&typeof old==="object"?{...old}:{away:null};return {...edits,[job.id]:{...next,return:value}};});}}/>
            </>
          }
        </div>)}<button onClick={recalcActualSummary}>Recalculate Actual Board</button></div>:<p className="empty">No worked jobs generated yet.</p>}

        <h2>Simulation Summary</h2>
        <p className="summaryMode"><b>Mode:</b> {summaryMode}</p>
        {summaryMode!=="Planned" && <p className="empty">Showing adjusted board based on edited actual tie-up times. Press Run to rebuild the planned summary.</p>}
        {summaryControls()}
        <pre className="summaryPre" style={{fontSize:`${summaryFontSize}px`}}>{result||"Run the simulation to see results here."}</pre>

        {summaryFullscreen&&<div className="summaryModal">
          <div className="summaryModalHeader"><strong>Simulation Summary — {summaryMode}</strong><button className="danger" onClick={()=>setSummaryFullscreen(false)}>Close</button></div>
          <div className="summaryModalControls">{summaryControls()}</div>
          <pre className="summaryPre modalPre" style={{fontSize:`${summaryFontSize}px`}}>{result || "Run the simulation to see results here."}</pre>
        </div>}
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById("root")).render(<App/>);
