const STORE_KEY='nutritionCore_v1_1';
const LEGACY_KEY='nutritionCore_v1';
const BASIC_FOODS=[
 {id:'b1',name:'白米（炊飯後）',amount:'100g',kcal:156,p:2.5,f:0.3,c:37.1,kind:'basic'},
 {id:'b2',name:'鶏むね肉 皮なし（加熱）',amount:'100g',kcal:121,p:25,f:1.9,c:0,kind:'basic'},
 {id:'b3',name:'鶏もも肉 皮なし（加熱）',amount:'100g',kcal:145,p:25.1,f:4.3,c:0,kind:'basic'},
 {id:'b4',name:'全卵',amount:'1個 約50g',kcal:71,p:6.1,f:5.1,c:.2,kind:'basic'},
 {id:'b5',name:'オートミール',amount:'40g',kcal:140,p:5.5,f:2.3,c:27.6,kind:'basic'},
 {id:'b6',name:'納豆',amount:'1パック 45g',kcal:83,p:7.4,f:4.5,c:5.4,kind:'basic'},
 {id:'b7',name:'木綿豆腐',amount:'150g',kcal:110,p:10.5,f:7.4,c:2.3,kind:'basic'},
 {id:'b8',name:'バナナ',amount:'1本 約100g',kcal:93,p:1.1,f:.2,c:22.5,kind:'basic'},
 {id:'b9',name:'無脂肪ヨーグルト',amount:'100g',kcal:43,p:4,f:.3,c:6.3,kind:'basic'},
 {id:'b10',name:'プロテイン（目安）',amount:'1杯',kcal:120,p:24,f:2,c:3,kind:'basic'},
 {id:'b11',name:'食パン 6枚切り',amount:'1枚',kcal:149,p:5.3,f:2.5,c:27.8,kind:'basic'},
 {id:'b12',name:'さつまいも（蒸し）',amount:'100g',kcal:131,p:1.2,f:.2,c:31.9,kind:'basic'}
];
const DEFAULT_STATE={
 profile:{complete:false,height:null,age:null,sex:'male',activity:1.55,goal:'loss',pace:'standard',autoAdjust:true},
 settings:{kcal:2200,p:150,f:65,c:250,targetWeight:null},
 auto:{lastAdjustmentDate:null,lastChange:0,lastReason:'14日分の体重傾向が揃うと、週1回だけ摂取目安を補正します。'},
 meals:[],weights:[],savedFoods:[]
};
let state=loadState();
let activeSearchFilter='all';

function q(s){return document.querySelector(s)}
function clone(v){return JSON.parse(JSON.stringify(v))}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function clamp(v,min,max){return Math.min(max,Math.max(min,v))}
function fmt(v,d=0){return n(v).toFixed(d).replace(/\.0$/,'')}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)}
function localDate(d=new Date()){const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)}
function daysBetween(a,b){return Math.floor((new Date(a+'T12:00:00')-new Date(b+'T12:00:00'))/86400000)}
function toast(msg){const t=q('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1900)}

function loadState(){
 try{
  const raw=localStorage.getItem(STORE_KEY)||localStorage.getItem(LEGACY_KEY);
  if(!raw)return clone(DEFAULT_STATE);
  const x=JSON.parse(raw);
  const merged={...clone(DEFAULT_STATE),...x,profile:{...DEFAULT_STATE.profile,...(x.profile||{})},settings:{...DEFAULT_STATE.settings,...(x.settings||{})},auto:{...DEFAULT_STATE.auto,...(x.auto||{})}};
  if(!x.profile) merged.profile.complete=false;
  return merged;
 }catch{return clone(DEFAULT_STATE)}
}
function persist(render=true){localStorage.setItem(STORE_KEY,JSON.stringify(state));if(render)renderAll()}

function goalLabel(g){return g==='loss'?'減量':g==='gain'?'増量':'維持'}
function paceLabel(p){return p==='gentle'?'ゆるめ':p==='fast'?'速め':'標準'}
function weeklyRate(goal,pace){
 if(goal==='maintain')return 0;
 const map=goal==='loss'?{gentle:.0025,standard:.005,fast:.0075}:{gentle:.001,standard:.0025,fast:.004};
 return map[pace]||map.standard;
}
function estimateTargets(profile,weight){
 const w=n(weight),h=n(profile.height),a=n(profile.age),sex=profile.sex;
 if(!w||!h||!a)return null;
 const bmr=10*w+6.25*h-5*a+(sex==='female'?-161:5);
 const tdee=bmr*n(profile.activity||1.55);
 const rate=weeklyRate(profile.goal,profile.pace);
 const weeklyKg=w*rate*(profile.goal==='loss'?-1:profile.goal==='gain'?1:0);
 const delta=(weeklyKg*7700)/7;
 let kcal=Math.round((tdee+delta)/10)*10;
 kcal=clamp(kcal,Math.round(bmr),6000);
 const proteinPerKg=profile.goal==='loss'?1.8:profile.goal==='gain'?1.7:1.6;
 let p=Math.round(w*proteinPerKg),f=Math.round(w*.8);
 let c=Math.round((kcal-p*4-f*9)/4);
 if(c<50){f=Math.max(Math.round(w*.6),35);c=Math.max(0,Math.round((kcal-p*4-f*9)/4));}
 return {bmr:Math.round(bmr),tdee:Math.round(tdee),kcal,p,f,c,weeklyKg};
}
function latestWeight(){return [...state.weights].sort((a,b)=>a.date.localeCompare(b.date)).at(-1)?.weight||null}
function setupWeight(){return latestWeight()||n(q('#profileWeight')?.value)}
function totalsFor(date){return state.meals.filter(m=>m.date===date).reduce((a,m)=>{a.kcal+=n(m.kcal);a.p+=n(m.p);a.f+=n(m.f);a.c+=n(m.c);return a},{kcal:0,p:0,f:0,c:0})}
function pct(v,target){return Math.min(100,Math.max(0,target?100*v/target:0))}
function avgRecent(w,count,skip){const a=w.slice().reverse().slice(skip,skip+count);return a.length?a.reduce((s,x)=>s+n(x.weight),0)/a.length:null}

function renderAll(){renderHome();renderHistory();renderSearch();renderWeights()}
function renderHome(){
 const day=localDate(),t=totalsFor(day),s=state.settings,p=state.profile;
 q('#calorieConsumed').textContent=Math.round(t.kcal);q('#calorieRemaining').textContent=Math.round(s.kcal-t.kcal);q('#calorieTarget').textContent=`${s.kcal} kcal`;q('#calorieBar').style.width=pct(t.kcal,s.kcal)+'%';q('#adaptiveTarget').textContent=s.kcal;
 [['p',t.p,s.p],['f',t.f,s.f],['c',t.c,s.c]].forEach(([k,v,target])=>{q(`#${k}Value`).textContent=fmt(v,1);q(`#${k}Bar`).style.width=pct(v,target)+'%';q(`#${k}Remain`).textContent=`${fmt(Math.max(0,target-v),1)}g left`});
 q('#profileGoal').textContent=p.complete?`${goalLabel(p.goal)} / ${paceLabel(p.pace)}`:'SETUP REQUIRED';
 q('#profileMeta').textContent=p.complete?`${fmt(p.height)}cm · ${p.age}歳 · 活動 ${activityLabel(p.activity)}`:'プロフィールを設定してください';
 q('#adjustmentTitle').textContent=p.autoAdjust?(state.auto.lastChange?`前回 ${state.auto.lastChange>0?'+':''}${state.auto.lastChange} kcal`:'データ収集中'):'自動調整 OFF';
 q('#adjustmentText').textContent=p.autoAdjust?state.auto.lastReason:'プロフィール設定からいつでもONにできます。';q('#adjustmentBadge').textContent=p.autoAdjust?'AUTO':'MANUAL';
 const meals=state.meals.filter(m=>m.date===day).sort((a,b)=>b.createdAt-a.createdAt);renderMealList(q('#todayMeals'),meals.slice(0,8));
 const weights=[...state.weights].sort((a,b)=>a.date.localeCompare(b.date));const last=weights.at(-1);q('#latestWeight').textContent=last?fmt(last.weight,1):'--';drawWeightChart(q('#weightChart'),weights.slice(-14));q('#weightTrendText').textContent=trendText(weights);
}
function activityLabel(v){const x=n(v);return x<=1.21?'低':x<=1.4?'やや低':x<=1.6?'普通':'高'}
function renderMealList(el,items){if(!items.length){el.innerHTML='<div class="empty">まだ記録がありません</div>';return}el.innerHTML=items.map(m=>`<div class="meal-item"><div class="meal-main"><strong>${esc(m.name)}</strong><div class="meal-meta">${esc(m.meal)}${m.amount?' · '+esc(m.amount):''}</div><div class="meal-macros">P ${fmt(m.p,1)} / F ${fmt(m.f,1)} / C ${fmt(m.c,1)}</div></div><div class="meal-side"><div class="meal-kcal">${fmt(m.kcal)} kcal</div><button class="delete-btn" data-del-meal="${m.id}">×</button></div></div>`).join('')}
function renderHistory(){const inp=q('#historyDate');if(!inp.value)inp.value=localDate();const t=totalsFor(inp.value);q('#historySummary').innerHTML=[['KCAL',fmt(t.kcal)],['P',fmt(t.p,1)+'g'],['F',fmt(t.f,1)+'g'],['C',fmt(t.c,1)+'g']].map(x=>`<div><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('');renderMealList(q('#historyMeals'),state.meals.filter(m=>m.date===inp.value).sort((a,b)=>b.createdAt-a.createdAt))}
function renderSearch(){const term=q('#foodSearch').value.trim().toLowerCase();let foods=[...state.savedFoods.map(x=>({...x,kind:'saved'})),...BASIC_FOODS];if(activeSearchFilter!=='all')foods=foods.filter(f=>f.kind===activeSearchFilter);if(term)foods=foods.filter(f=>f.name.toLowerCase().includes(term));q('#searchResults').innerHTML=foods.length?foods.map(f=>`<div class="food-result"><div><strong>${esc(f.name)}</strong><div class="meta">${esc(f.amount||'')} · ${fmt(f.kcal)} kcal · P${fmt(f.p,1)} F${fmt(f.f,1)} C${fmt(f.c,1)}</div></div><button data-add-food="${f.id}" data-kind="${f.kind}">追加</button></div>`).join(''):'<div class="empty">該当する食品がありません</div>'}
function renderWeights(){const w=[...state.weights].sort((a,b)=>a.date.localeCompare(b.date)),last=w.at(-1),avg7=avgRecent(w,7,0),prev7=avgRecent(w,7,7);q('#weightLatestLarge').textContent=last?fmt(last.weight,1)+' kg':'-- kg';q('#weightAvg7').textContent=avg7?fmt(avg7,1)+' kg':'-- kg';q('#weightWeekDelta').textContent=(avg7&&prev7?((avg7-prev7>=0?'+':'')+fmt(avg7-prev7,1)):'--')+' kg';drawWeightChart(q('#weightChartLarge'),w.slice(-30));q('#weightHistory').innerHTML=w.length?[...w].reverse().map(x=>`<div class="weight-row"><span>${x.date}</span><strong>${fmt(x.weight,1)} kg</strong></div>`).join(''):'<div class="empty">まだ体重記録がありません</div>'}
function trendText(w){const a=avgRecent(w,7,0),b=avgRecent(w,7,7);if(!a||!b)return w.length?'7日分たまると週平均を表示します':'データ未登録';const d=a-b;return `7日平均 ${fmt(a,1)} kg / 前週比 ${d>=0?'+':''}${fmt(d,1)} kg`}
function drawWeightChart(canvas,weights){const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height;ctx.clearRect(0,0,W,H);ctx.strokeStyle='#18231c';ctx.lineWidth=1;for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(0,H*i/4);ctx.lineTo(W,H*i/4);ctx.stroke()}if(weights.length<2)return;const vals=weights.map(x=>n(x.weight)),min=Math.min(...vals)-.5,max=Math.max(...vals)+.5,span=max-min||1,pts=vals.map((v,i)=>({x:18+i*(W-36)/(vals.length-1),y:18+(max-v)/span*(H-36)}));ctx.strokeStyle='#54f59b';ctx.lineWidth=4;ctx.shadowColor='rgba(84,245,155,.32)';ctx.shadowBlur=14;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#54f59b';pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill()})}

function readProfile(prefix){return {height:n(q(`#${prefix}Height`).value),age:n(q(`#${prefix}Age`).value),sex:q(`#${prefix}Sex`).value,activity:n(q(`#${prefix}Activity`).value),goal:q(`#${prefix}Goal${prefix==='profile'?'Select':''}`).value,pace:q(`#${prefix}Pace`).value,autoAdjust:q(`#${prefix}AutoAdjust`).checked}}
function updateSetupPreview(){const p=readProfile('profile'),w=n(q('#profileWeight').value),x=estimateTargets(p,w);q('#setupPreview').innerHTML=x?`<span>推定維持 <b>${x.tdee}</b> kcal</span><span>開始目標 <b>${x.kcal}</b> kcal</span><span>P <b>${x.p}g</b> / F <b>${x.f}g</b> / C <b>${x.c}g</b></span>`:'身長・体重・年齢を入力すると目安を表示します。'}
['profileHeight','profileWeight','profileAge','profileSex','profileActivity','profileGoalSelect','profilePace'].forEach(id=>q('#'+id).addEventListener('input',updateSetupPreview));
q('#setupForm').addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;const p=readProfile('profile'),w=n(q('#profileWeight').value),x=estimateTargets(p,w);if(!x)return;state.profile={...p,complete:true};state.settings={kcal:x.kcal,p:x.p,f:x.f,c:x.c,targetWeight:q('#profileTargetWeight').value?n(q('#profileTargetWeight').value):null};state.weights=[{date:localDate(),weight:w}];state.auto={...DEFAULT_STATE.auto};persist();toast('プロフィールを設定しました')});

function maybeAutoAdjust(date){
 if(!state.profile.complete||!state.profile.autoAdjust)return;
 const w=[...state.weights].sort((a,b)=>a.date.localeCompare(b.date));if(w.length<14){state.auto.lastReason=`体重記録 ${w.length}/14。14日分そろうまで目標は固定です。`;return}
 if(state.auto.lastAdjustmentDate&&daysBetween(date,state.auto.lastAdjustmentDate)<7){const left=7-daysBetween(date,state.auto.lastAdjustmentDate);state.auto.lastReason=`次の自動判定まで約${left}日。日々の増減では変更しません。`;return}
 const a=avgRecent(w,7,0),b=avgRecent(w,7,7);if(!a||!b)return;const actual=a-b,goal=state.profile.goal,rate=weeklyRate(goal,state.profile.pace),expected=b*rate*(goal==='loss'?-1:goal==='gain'?1:0),tol=Math.max(.1,b*.002);let change=0;
 if(goal==='loss'){if(actual>expected+tol)change=-100;else if(actual<expected-tol)change=100}
 else if(goal==='gain'){if(actual<expected-tol)change=100;else if(actual>expected+tol)change=-100}
 else {if(actual>tol)change=-100;else if(actual<-tol)change=100}
 state.auto.lastAdjustmentDate=date;state.auto.lastChange=change;
 if(change){state.settings.kcal=clamp(state.settings.kcal+change,800,6000);recalcMacrosFromCurrentKcal(a);state.auto.lastReason=`7日平均の前週差 ${actual>=0?'+':''}${fmt(actual,2)}kg（目安 ${expected>=0?'+':''}${fmt(expected,2)}kg）→ ${change>0?'+':''}${change} kcal補正。`}
 else state.auto.lastReason=`7日平均の前週差 ${actual>=0?'+':''}${fmt(actual,2)}kg。目標ペース内のため ${state.settings.kcal} kcalを維持。`;
}
function recalcMacrosFromCurrentKcal(weight){const w=n(weight)||latestWeight();if(!w)return;const p=Math.round(w*(state.profile.goal==='loss'?1.8:state.profile.goal==='gain'?1.7:1.6)),f=Math.round(w*.8),c=Math.max(0,Math.round((state.settings.kcal-p*4-f*9)/4));state.settings.p=p;state.settings.f=f;state.settings.c=c}

function openFood(prefill={}){q('#foodForm').reset();q('#foodDate').value=localDate();q('#foodP').value=0;q('#foodF').value=0;q('#foodC').value=0;Object.entries({foodName:prefill.name,foodKcal:prefill.kcal,foodAmount:prefill.amount,foodP:prefill.p,foodF:prefill.f,foodC:prefill.c}).forEach(([id,val])=>{if(val!==undefined)q('#'+id).value=val});q('#foodDialog').showModal()}
function openWeight(){q('#weightForm').reset();q('#weightDate').value=localDate();const last=latestWeight();if(last)q('#weightInput').value=last;q('#weightDialog').showModal();setTimeout(()=>q('#weightInput').focus(),100)}
function openSettings(){const p=state.profile,s=state.settings;[['setHeight',p.height],['setAge',p.age],['setSex',p.sex],['setActivity',p.activity],['setGoal',p.goal],['setPace',p.pace],['setTargetWeight',s.targetWeight],['setKcal',s.kcal],['setP',s.p],['setF',s.f],['setC',s.c]].forEach(([id,v])=>q('#'+id).value=v??'');q('#setAutoAdjust').checked=!!p.autoAdjust;q('#settingsDialog').showModal()}
q('#foodForm').addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;const m={id:uid(),name:q('#foodName').value.trim(),kcal:n(q('#foodKcal').value),amount:q('#foodAmount').value.trim(),p:n(q('#foodP').value),f:n(q('#foodF').value),c:n(q('#foodC').value),meal:q('#foodMeal').value,date:q('#foodDate').value||localDate(),createdAt:Date.now()};state.meals.push(m);if(q('#saveFoodToggle').checked)saveFoodFromMeal(m);persist();toast('食事を記録しました')});
q('#weightForm').addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;const date=q('#weightDate').value||localDate(),weight=n(q('#weightInput').value);state.weights=state.weights.filter(x=>x.date!==date);state.weights.push({date,weight});maybeAutoAdjust(date);persist();toast(state.auto.lastChange?`体重保存 / 目標 ${state.auto.lastChange>0?'+':''}${state.auto.lastChange} kcal`:'体重を記録しました')});
q('#settingsForm').addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;state.profile={...state.profile,height:n(q('#setHeight').value),age:n(q('#setAge').value),sex:q('#setSex').value,activity:n(q('#setActivity').value),goal:q('#setGoal').value,pace:q('#setPace').value,autoAdjust:q('#setAutoAdjust').checked,complete:true};state.settings={kcal:n(q('#setKcal').value),p:n(q('#setP').value),f:n(q('#setF').value),c:n(q('#setC').value),targetWeight:q('#setTargetWeight').value?n(q('#setTargetWeight').value):null};persist();toast('設定を保存しました')});
q('#recalcBtn').addEventListener('click',()=>{const p={...state.profile,height:n(q('#setHeight').value),age:n(q('#setAge').value),sex:q('#setSex').value,activity:n(q('#setActivity').value),goal:q('#setGoal').value,pace:q('#setPace').value};const x=estimateTargets(p,latestWeight());if(!x){toast('体重記録が必要です');return}q('#setKcal').value=x.kcal;q('#setP').value=x.p;q('#setF').value=x.f;q('#setC').value=x.c;toast('プロフィールから再計算しました')});
function saveFoodFromMeal(m){const existing=state.savedFoods.findIndex(x=>x.name===m.name),f={id:existing>=0?state.savedFoods[existing].id:uid(),name:m.name,kcal:m.kcal,amount:m.amount,p:m.p,f:m.f,c:m.c};if(existing>=0)state.savedFoods[existing]=f;else state.savedFoods.unshift(f)}

function navigate(name){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));q('#'+name+'View').classList.add('active');document.querySelectorAll('.nav-btn[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));if(name==='history')renderHistory();if(name==='search')renderSearch();if(name==='weight')renderWeights();window.scrollTo({top:0,behavior:'smooth'})}
document.addEventListener('click',e=>{const a=e.target.closest('[data-action]');if(a){if(a.dataset.action==='food')openFood();if(a.dataset.action==='weight')openWeight();if(a.dataset.action==='scan')openScan()}const nav=e.target.closest('[data-nav]');if(nav)navigate(nav.dataset.nav);const del=e.target.closest('[data-del-meal]');if(del){state.meals=state.meals.filter(m=>m.id!==del.dataset.delMeal);persist();toast('削除しました')}const add=e.target.closest('[data-add-food]');if(add){const arr=add.dataset.kind==='basic'?BASIC_FOODS:state.savedFoods,food=arr.find(x=>x.id===add.dataset.addFood);if(food)openFood(food)}});
q('#settingsBtn').addEventListener('click',openSettings);q('#historyDate').addEventListener('change',renderHistory);q('#foodSearch').addEventListener('input',renderSearch);document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{activeSearchFilter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderSearch()}));

function openScan(){q('#scanPreview').hidden=true;q('#ocrStatus').hidden=true;q('#ocrResult').hidden=true;q('#scanFile').value='';q('#scanName').value='';q('#scanDate').value=localDate();q('#scanDialog').showModal()}
q('#scanClose').addEventListener('click',()=>q('#scanDialog').close());q('#scanPickBtn').addEventListener('click',()=>q('#scanFile').click());
q('#scanFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;const img=q('#scanPreview');img.src=URL.createObjectURL(file);img.hidden=false;q('#ocrStatus').hidden=false;q('#ocrResult').hidden=true;try{if(!window.Tesseract)throw new Error('OCRライブラリを読み込めません');const r=await Tesseract.recognize(file,'jpn+eng',{logger:m=>{if(m.status==='recognizing text')q('#ocrProgress').textContent=`READING ${Math.round((m.progress||0)*100)}%`;else q('#ocrProgress').textContent=(m.status||'').toUpperCase()}});q('#ocrStatus').hidden=true;q('#ocrResult').hidden=false;q('#ocrRaw').textContent=r.data.text||'';applyOcr(r.data.text||'');toast('読み取り完了。数字を確認してください')}catch(err){q('#ocrStatus').hidden=true;q('#ocrResult').hidden=false;q('#ocrRaw').textContent='OCRエラー: '+err.message;toast('OCRに失敗。手入力で記録できます')}});
function extractNum(text,patterns){for(const p of patterns){const m=text.match(p);if(m)return n((m[1]||'').replace(',','.'))}return 0}
function applyOcr(raw){const text=raw.replace(/[０-９]/g,d=>'０１２３４５６７８９'.indexOf(d)).replace(/，/g,',').replace(/．/g,'.');q('#scanKcal').value=extractNum(text,[/(?:熱量|エネルギー)[^\d]{0,14}(\d+(?:[\.,]\d+)?)\s*(?:kcal|k cal|Kcal)/i,/(\d+(?:[\.,]\d+)?)\s*kcal/i])||'';q('#scanP').value=extractNum(text,[/(?:たんぱく質|タンパク質|蛋白質|protein)[^\d]{0,12}(\d+(?:[\.,]\d+)?)\s*g/i])||'';q('#scanF').value=extractNum(text,[/(?:脂質|fat)[^\d]{0,12}(\d+(?:[\.,]\d+)?)\s*g/i])||'';q('#scanC').value=extractNum(text,[/(?:炭水化物|carbohydrate|carbs?)[^\d]{0,12}(\d+(?:[\.,]\d+)?)\s*g/i])||'';const is100=/100\s*g\s*(?:当たり|あたり|当り|per)/i.test(text)||/(?:当たり|あたり|当り)\s*100\s*g/i.test(text);q('#scanBasis').value=is100?'100g':'package';q('#hundredGramFields').hidden=!is100}
q('#scanBasis').addEventListener('change',()=>q('#hundredGramFields').hidden=q('#scanBasis').value!=='100g');q('#scanSaveBtn').addEventListener('click',()=>{let factor=1,amount='1包装';if(q('#scanBasis').value==='100g'){const grams=n(q('#scanGrams').value);factor=grams/100;amount=grams+'g'}const m={id:uid(),name:q('#scanName').value.trim()||'栄養成分スキャン',kcal:n(q('#scanKcal').value)*factor,p:n(q('#scanP').value)*factor,f:n(q('#scanF').value)*factor,c:n(q('#scanC').value)*factor,amount,meal:q('#scanMeal').value,date:q('#scanDate').value||localDate(),createdAt:Date.now()};if(!m.kcal&&!m.p&&!m.f&&!m.c){toast('栄養値を確認してください');return}state.meals.push(m);if(q('#scanSaveFood').checked)saveFoodFromMeal(m);persist();q('#scanDialog').close();toast('スキャン結果を記録しました')});

q('#exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`nutrition-core-backup-${localDate()}.json`;a.click();URL.revokeObjectURL(a.href)});
q('#importFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!data.settings||!Array.isArray(data.meals)||!Array.isArray(data.weights))throw new Error('format');state={...clone(DEFAULT_STATE),...data,profile:{...DEFAULT_STATE.profile,...(data.profile||{})},settings:{...DEFAULT_STATE.settings,...data.settings},auto:{...DEFAULT_STATE.auto,...(data.auto||{})}};persist();toast('バックアップを復元しました')}catch{toast('復元できないファイルです')}});

if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
q('#historyDate').value=q('#foodDate').value=q('#weightDate').value=q('#scanDate').value=localDate();renderAll();
if(!state.profile.complete){q('#setupDialog').showModal();updateSetupPreview()}
