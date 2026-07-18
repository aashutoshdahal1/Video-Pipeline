const c={QUEUE_NEXT:"queue:next",PROCESSING_COMPLETE:"processing:complete",PROCESSING_STOP:"processing:stop",PROCESSING_TERMINATE:"processing:terminate",TASK_START:"task:start",TASK_COMPLETED:"task:completed",TASK_ERROR:"task:error",TASK_SKIPPED:"task:skipped",DAILY_LIMIT_FALLBACK:"task:daily_limit_fallback",OVERLAY_SHOW:"overlay:show",OVERLAY_HIDE:"overlay:hide",OVERLAY_MESSAGE:"overlay:message",OVERLAY_PAUSING:"overlay:pausing",OVERLAY_ERROR_BANNER:"overlay:error_banner",OVERLAY_ERROR_BANNER_CLEAR:"overlay:error_banner_clear",PAGE_ZOOM_CHANGED:"page:zoom_changed",COUNTDOWN_START:"countdown:start",PROGRESS_UPDATE:"progress:update"},G=new Map;function St(e,t){return G.has(e)||G.set(e,new Set),G.get(e).add(t),()=>rt(e,t)}function ao(e,t){const o=n=>{rt(e,o),t(n)};St(e,o)}function rt(e,t){const o=G.get(e);o&&(o.delete(t),o.size===0&&G.delete(e))}function so(e,t){const o=G.get(e);if(!(!o||o.size===0))for(const n of o)try{n(t)}catch(r){console.error(`❌ EventBus: handler error for event "${e}":`,r)}}function lo(e){G.delete(e)}function co(){G.clear()}function uo(){const e={};for(const[t,o]of G.entries())e[t]=o.size;return e}console.log("✅ EventBus module loaded");const ve=Object.freeze(Object.defineProperty({__proto__:null,EVENTS:c,clear:lo,clearAll:co,debugListeners:uo,emit:so,off:rt,on:St,once:ao},Symbol.toStringTag,{value:"Module"}));function T(e){return new Promise(t=>setTimeout(t,e))}function mo(e,t=document){try{return document.evaluate(e,t,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue}catch(o){return console.error("❌ XPath evaluation error:",o,`
XPath:`,e),null}}console.log("✅ DomUtils module loaded");let b=null,Xe=null;function xt(e,t=null){b=e,Xe=t,console.log("✅ StateManager EventBus wired")}let Ie=!1,Pe=null,it=null,$=!1,H=!1,P=0,_=[],k={autoDownload:!0,delayBetweenPrompts:8e3,delayMin:15,delayMax:30,flowVideoCount:"1",flowModel:"default",flowAspectRatio:"landscape",imageDownloadQuality:"1K",videoDownloadQuality:"720p"},at=!1,se=null,le=null,st=null,E=[],q=0,At=null,Tt=5e3,kt=null,vt=null,de=null,It=3,Pt=0,Mt=new Set;const Se="flowAutomationState",Ct={PROMPT_POLICY_ERROR_POPUP_XPATH:"//li[@data-sonner-toast and .//i[normalize-space(text())='error'] and not(.//*[contains(., '5')])]",QUEUE_FULL_POPUP_XPATH:"//li[@data-sonner-toast and .//i[normalize-space(text())='error'] and .//*[contains(., '5')]]"};function Me(){return{isUserLoggedIn:Ie,subscriptionStatus:Pe,userId:it,isProcessing:$,isPausing:H,currentPromptIndex:P,prompts:_,settings:k,isCurrentPromptProcessed:at,lastAppliedSettings:se,lastAppliedMode:le,fallbackModel:st,taskList:E,currentTaskIndex:q,tileScanInterval:At,scanIntervalMs:Tt,currentProcessingPrompt:kt,currentTaskStartTime:vt,countdownInterval:de,maxRetries:It,currentRetries:Pt,preSubmitTileIds:Mt}}function ee(e){if(e.isUserLoggedIn!==void 0&&(Ie=e.isUserLoggedIn),e.subscriptionStatus!==void 0&&(Pe=e.subscriptionStatus),e.userId!==void 0&&(it=e.userId),e.isProcessing!==void 0){const t=$;$=e.isProcessing,t!==$&&chrome.runtime.sendMessage({action:"automationStateChanged",isRunning:$}).catch(()=>{})}e.isPausing!==void 0&&(H=e.isPausing),e.currentPromptIndex!==void 0&&(P=e.currentPromptIndex),e.prompts!==void 0&&(_=e.prompts),e.settings!==void 0&&(k=e.settings),e.isCurrentPromptProcessed!==void 0&&(at=e.isCurrentPromptProcessed),e.lastAppliedSettings!==void 0&&(se=e.lastAppliedSettings),e.lastAppliedMode!==void 0&&(le=e.lastAppliedMode),e.fallbackModel!==void 0&&(st=e.fallbackModel),e.taskList!==void 0&&(E=e.taskList),e.currentTaskIndex!==void 0&&(q=e.currentTaskIndex),e.tileScanInterval!==void 0&&(At=e.tileScanInterval),e.scanIntervalMs!==void 0&&(Tt=e.scanIntervalMs),e.currentProcessingPrompt!==void 0&&(kt=e.currentProcessingPrompt),e.currentTaskStartTime!==void 0&&(vt=e.currentTaskStartTime),e.countdownInterval!==void 0&&(de=e.countdownInterval),e.maxRetries!==void 0&&(It=e.maxRetries),e.currentRetries!==void 0&&(Pt=e.currentRetries),e.preSubmitTileIds!==void 0&&(Mt=e.preSubmitTileIds)}function go(){return k}function po(e){k={...k,...e}}function fo(){return E}function ho(e,t){E[e]&&(E[e]={...E[e],...t})}function bo(){return E[P]||null}function wo(e){return E.find(t=>t.index===e)||null}function yo(){return E.find(e=>e.status==="current")||null}async function X(){const e={status:$?"running":"paused",isProcessing:$,prompts:_.map(t=>t),currentIndex:P,totalPrompts:_.length,processedCount:P,currentPrompt:_[P]||"",settings:k,startTime:Date.now(),lastUpdate:Date.now(),taskList:E,currentTaskIndex:q};return new Promise(t=>{chrome.storage.local.set({[Se]:e},()=>{t(e)})})}async function be(){return new Promise(e=>{chrome.storage.local.get(Se,t=>{const o=t[Se];e(o||null)})})}async function Rt(){return new Promise(e=>{chrome.storage.local.remove(Se,()=>{e()})})}(async function(){const t=await be();t&&t.status==="paused"&&(_=t.prompts||[],P=t.currentIndex||0,k=t.settings||k,E=t.taskList||[],q=t.currentTaskIndex||0,$=!1,console.log(`📋 Restored ${E.length} tasks from storage`),chrome.runtime.sendMessage({action:"stateRestored",state:t}).catch(()=>{}),E.length>0&&E.forEach(o=>ce(o)))})();function De(e,t,o){return e&&e.settings&&e.settings[t]!==void 0?e.settings[t]:o[t]}function Eo(e,t){let o=De(e,"delayMin",t),n=De(e,"delayMax",t);if(o===void 0||n===void 0){const i=De(e,"delayBetweenPrompts",t)||8;o=i/1e3,n=i/1e3}o>n&&([o,n]=[n,o]);const r=o+Math.random()*(n-o);return Math.round(r*1e3)}function Ue(){de&&(clearInterval(de),de=null)}function So(e){const t=Math.floor(e/1e3),o=Math.floor(t/60),n=t%60;return o>0?`${o}m ${n}s`:`${n}s`}function xo(e,t){Ue();let o=e;const n=Date.now(),r=(e/1e3).toFixed(1);b&&b.emit(c.OVERLAY_MESSAGE,`⏱️ Waiting ${r}s before ${t}...`),de=setInterval(()=>{const a=Date.now()-n;if(o=e-a,o<=0){Ue(),b&&b.emit(c.OVERLAY_MESSAGE,`▶️ Starting ${t}...`);return}const i=(o/1e3).toFixed(1);b&&b.emit(c.OVERLAY_MESSAGE,`⏱️ Waiting ${i}s before ${t}...`)},100)}function Be(){return new Promise(e=>{let t=0;const o=3,n=1e3;function r(){chrome.runtime.sendMessage({action:"getAuthState"},a=>{if(chrome.runtime.lastError){if(t<o){t++,setTimeout(r,n);return}e({isLoggedIn:!1,subscriptionStatus:null,error:"Could not verify authentication state"});return}a?(Ie=a.isLoggedIn,Pe=a.subscriptionStatus,e(a)):t<o?(t++,setTimeout(r,n)):e({isLoggedIn:!1,subscriptionStatus:null,error:"No response from background script"})})}r()})}chrome.runtime.sendMessage({action:"getAuthState"},e=>{e&&(Ie=e.isLoggedIn,Pe=e.subscriptionStatus)});chrome.runtime.onMessage.addListener(function(e,t,o){const n={received:!0};if(e.action==="startProcessing")return Be().then(r=>{$?o({...n,error:"Already processing"}):(k={...k,...e.settings,flowVideoCount:e.settings.flowVideoCount||k.flowVideoCount,flowModel:e.settings.flowModel||k.flowModel,flowAspectRatio:e.settings.flowAspectRatio||k.flowAspectRatio},ee({isProcessing:!0}),P=0,se=null,le=null,e.useUnifiedQueue&&e.queueTasks?(console.log("🎯 Using UNIFIED QUEUE system"),E=e.queueTasks.map(a=>{var i;return{queueTaskId:a.id,index:a.index,prompt:a.prompt,status:"pending",expectedVideos:parseInt((i=a.settings)==null?void 0:i.count,10)||1,foundVideos:0,videoUrls:[],settings:a.settings,referenceImages:a.referenceImages||null}}),_=E.map(a=>a.prompt),console.log(`✅ Created ${E.length} tasks from unified queue`)):(console.warn("⚠️ startProcessing received without useUnifiedQueue — ignoring"),E=[],_=[]),q=0,X(),b&&b.emit(c.QUEUE_NEXT),o({...n,started:!0}))}).catch(r=>{chrome.runtime.sendMessage({action:"error",error:"Authentication verification failed. Please try again."}),o({...n,error:"Authentication verification failed"})}),!0;if(e.action==="resumeProcessing")return be().then(r=>{r&&r.status==="paused"?(_=r.prompts||[],P=r.currentIndex||0,k=r.settings||k,E=r.taskList||[],q=r.currentTaskIndex||0,ee({isProcessing:!0}),H=!1,chrome.runtime.sendMessage({action:"setPageZoom",zoomFactor:.75}).catch(()=>{}),b&&b.emit(c.PAGE_ZOOM_CHANGED,{zoom:.75}),console.log(`▶️ Resuming Meta AI from prompt ${P+1}/${_.length}`),console.log(`📋 Restored ${E.length} tasks`),X(),E.forEach(a=>ce(a)),b&&b.emit(c.QUEUE_NEXT),o({...n,resumed:!0})):o({...n,error:"No paused state to resume"})}),!0;if(e.action==="resumeAfterCacheClean")return be().then(r=>{var a;r&&(r.status==="running"||r.status==="paused")&&((a=r.prompts)==null?void 0:a.length)>0?(_=r.prompts||[],P=r.currentIndex||0,k=r.settings||k,E=r.taskList||[],q=r.currentTaskIndex||0,$=!0,H=!1,se=null,le=null,chrome.runtime.sendMessage({action:"setPageZoom",zoomFactor:.75}).catch(()=>{}),b&&b.emit(c.PAGE_ZOOM_CHANGED,{zoom:.75}),X(),E.forEach(i=>ce(i)),console.log(`🔄 resumeAfterCacheClean: restored ${E.length} tasks, resuming from index ${P}`),b&&b.emit(c.QUEUE_NEXT),o({...n,resumed:!0})):(console.warn("⚠️ resumeAfterCacheClean: no valid saved state found — cannot auto-resume"),o({...n,error:"No valid saved state"}))}),!0;if(e.action==="resumeAfterAnimateRecheck")return chrome.storage.local.get(["animateRecheckState","flowAutomationState"],r=>{const a=r.animateRecheckState,i=r.flowAutomationState;if(chrome.storage.local.remove("animateRecheckState"),!a||!i){console.warn("⚠️ resumeAfterAnimateRecheck: missing recheck or flow state — skipping recheck"),o({received:!0,skipped:!0});return}_=i.prompts||[],P=i.currentIndex||0,k=i.settings||k,E=i.taskList||[],q=i.currentTaskIndex||0,$=!0,H=!1,se=null,le=null,chrome.runtime.sendMessage({action:"setPageZoom",zoomFactor:.75}).catch(()=>{}),b&&b.emit(c.PAGE_ZOOM_CHANGED,{zoom:.75}),E.forEach(f=>ce(f));const{expectedNewVideos:l,preAnimateCardIds:d}=a,u=new Set(d||[]);setTimeout(()=>{const f=Array.from(document.querySelectorAll("div.group\\/media-item")).filter(w=>{var s;const x=(s=w.querySelector('a[aria-label="View media"]'))==null?void 0:s.getAttribute("href");return x&&!u.has(x)&&w.querySelector('div[data-testid="generated-video"]')}),S=f.length>=l;if(console.log(`🔁 [AnimateRecheck] After reload: ${f.length}/${l} new video card(s) found`),S){if(b&&b.emit(c.OVERLAY_MESSAGE,"✅ Animate recheck passed — all videos ready"),console.log("✅ [AnimateRecheck] All videos confirmed after page reload"),(k==null?void 0:k.autoDownload)!==!1){const x=E.find(D=>D.index===a.taskIndex),L=((x==null?void 0:x.prompt)||"").trim().replace(/[\\/:*?"<>|,]/g,"").replace(/\s+/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,"").substring(0,80)||`download_${Date.now()}`;f.forEach((D,Y)=>{const ne=D.querySelector('div[data-testid="generated-video"]'),re=ne==null?void 0:ne.getAttribute("data-video-url");if(re!=null&&re.startsWith("http")){const ie=`${L}_animated_${Y+1}.mp4`;chrome.runtime.sendMessage({action:"downloadVideo",url:re,filename:ie}),console.log(`⬇️ [AnimateRecheck] Downloading video ${Y+1}/${f.length}: ${ie}`)}})}}else b&&b.emit(c.OVERLAY_MESSAGE,"⚠️ Animate recheck: videos still missing — continuing anyway"),console.warn("⚠️ [AnimateRecheck] Videos still not found after reload — moving on");const m=E.find(w=>w.index===a.taskIndex);m&&ce(m),X(),b&&m?b.emit(c.TASK_COMPLETED,{task:m,taskIndex:P}):b&&(P=Math.min(P+1,E.length),X(),b.emit(c.QUEUE_NEXT))},3e3),o({received:!0})}),!0;if(e.action==="stopProcessing")b&&b.emit(c.PROCESSING_STOP),Ue(),ee({isProcessing:!1}),H=!0,chrome.runtime.sendMessage({action:"resetPageZoom"}).catch(()=>{}),b&&b.emit(c.PAGE_ZOOM_CHANGED,{zoom:1}),X(),at?(H=!1,b&&b.emit(c.OVERLAY_HIDE),chrome.runtime.sendMessage({action:"updateStatus",status:"Processing paused. Click Resume to continue."})):(b&&b.emit(c.OVERLAY_PAUSING),chrome.runtime.sendMessage({action:"updateStatus",status:"Meta AI will pause after current prompt completes..."})),o(n);else if(e.action==="terminateProcessing")b&&b.emit(c.PAGE_ZOOM_CHANGED,{zoom:1}),chrome.runtime.sendMessage({action:"resetPageZoom"}).catch(()=>{}),ee({isProcessing:!1}),H=!1,_=[],P=0,E=[],q=0,se=null,le=null,st=null,Rt(),b&&(b.emit(c.PROCESSING_TERMINATE),b.emit(c.OVERLAY_HIDE)),o({...n,terminated:!0});else{if(e.action==="getStoredState")return be().then(r=>{o({...n,state:r})}),!0;if(e.action==="authStateChanged")Ie=e.isLoggedIn,Pe=e.subscriptionStatus,it=e.userId,o({success:!0});else if(e.action==="activateContentDownloader")Xe?(Xe.toggle(),o({received:!0,toggled:!0})):(console.warn("⚠️ activateContentDownloader: ContentDownloadManager not wired"),o({received:!0,toggled:!1,error:"ContentDownloadManager not available"}));else if(e.action==="clickNewProjectButton"){try{const r=mo("//button[.//i[normalize-space()='add_2']]");r?(console.log("✅ New project button found. Clicking..."),r.click(),o({success:!0})):(console.warn("⚠️ New project button not found"),o({success:!1,error:"Button not found"}))}catch(r){console.error("❌ Error clicking new project button:",r),o({success:!1,error:r.message})}return!0}else o(n)}});document.addEventListener("visibilitychange",()=>{document.hidden||setTimeout(()=>{Be().then(e=>{chrome.runtime.sendMessage({action:"authStateRefreshed",authState:e}).catch(()=>{})})},500)});window.addEventListener("focus",()=>{setTimeout(()=>{Be().then(e=>{chrome.runtime.sendMessage({action:"authStateRefreshed",authState:e}).catch(()=>{})})},500)});function ce(e){e.queueTaskId&&chrome.runtime.sendMessage({action:"queueTaskUpdate",taskId:e.queueTaskId,updates:{status:e.status}}).catch(()=>{})}console.log("✅ State Manager module loaded");const Ke=Object.freeze(Object.defineProperty({__proto__:null,SELECTORS:Ct,STORAGE_KEY:Se,clearCountdownTimer:Ue,clearStateFromStorage:Rt,formatTime:So,getCurrentTask:bo,getCurrentTaskByStatus:yo,getEffectiveSetting:De,getRandomDelay:Eo,getSettings:go,getState:Me,getTaskByIndex:wo,getTaskList:fo,init:xt,loadStateFromStorage:be,saveStateToStorage:X,sendTaskUpdate:ce,setState:ee,startCountdown:xo,updateSettings:po,updateTask:ho,verifyAuthenticationState:Be},Symbol.toStringTag,{value:"Module"}));let xe=null;const gt='textarea[data-testid="composer-input"]';function Ao(e){xe=e,console.log("✅ TextInjector initialized")}const To=120;async function ko(e){var t;try{const o=document.querySelector(gt);return o?((t=(xe?xe():{}).settings)==null?void 0:t.stealthMode)||!1?e.length>To?(console.log(`🥷 Stealth Mode: Long prompt (${e.length} chars) — using human-like paste simulation...`),await vo(o,e)?(console.log("✅ Text pasted with human-like behavior (textarea)"),!0):(console.log("⏸️ Paste was interrupted or failed"),!1)):(console.log(`🥷 Stealth Mode: Short prompt (${e.length} chars) — using human-like typing...`),await Mo(o,e)?(console.log("✅ Text typed with human-like behavior (textarea)"),!0):(console.log("⏸️ Typing was interrupted"),!1)):await Lt(o,e):(console.error(`🔴 Meta AI textarea "${gt}" not found`),!1)}catch(o){return console.error("❌ Error injecting text into Meta AI textarea:",o),!1}}async function Lt(e,t){var r;e.focus(),await T(150);const o=(r=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value"))==null?void 0:r.set;o?o.call(e,t):e.value=t,e.dispatchEvent(new Event("input",{bubbles:!0})),await T(400);const n=e.value.trim();return n===t.trim()||n.includes(t.substring(0,20))?(console.log("✅ Text injected successfully into Meta AI textarea"),!0):(console.warn("⚠️ Text injection may have failed. Got:",JSON.stringify(n.substring(0,50))),!0)}async function vo(e,t){const o=300+Math.random()*600;console.log(`🥷 Paste simulation: thinking pause ${Math.round(o)}ms...`),await T(o),e.focus(),e.click(),await T(150+Math.random()*100),e.select(),await T(80+Math.random()*80);const n=new DataTransfer;n.setData("text/plain",t);const r=new ClipboardEvent("paste",{bubbles:!0,cancelable:!0,clipboardData:n});e.dispatchEvent(r),await T(300+Math.random()*200);const a=e.value.trim();return a===t.trim()||a.includes(t.substring(0,30))?(console.log("✅ Paste simulation: SUCCESS"),!0):(console.warn("⚠️ Paste simulation: ClipboardEvent ignored — falling back to fast inject"),await Lt(e,t))}const Io={a:["q","w","s","z"],b:["v","g","h","n"],c:["x","d","f","v"],d:["s","e","r","f","c"],e:["w","r","d"],f:["d","r","t","g","v"],g:["f","t","y","h","b"],h:["g","y","u","j","n"],i:["u","o","k"],j:["h","u","i","k","n"],k:["j","i","o","l"],l:["k","o","p"],m:["n","j","k"],n:["b","h","j","m"],o:["i","p","l","k"],p:["o","l"],q:["w","a"],r:["e","t","f"],s:["a","w","e","d","z"],t:["r","y","g"],u:["y","i","h","j"],v:["c","f","g","b"],w:["q","e","s"],x:["z","s","d","c"],y:["t","u","g","h"],z:["a","s"]},Po=new Set(["th","he","in","er","an","re","on","en","at","es","ti","or"]);async function Mo(e,t){var i;const o=(i=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value"))==null?void 0:i.set;e.focus(),await T(150),o?o.call(e,""):e.value="",e.dispatchEvent(new Event("input",{bubbles:!0})),await T(150),console.log(`🥷 Stealth Typing: "${t.substring(0,40)}${t.length>40?"...":""}"`);let n="",r="";for(let l=0;l<t.length;l++){const d=xe?xe():{};if(!d.isProcessing&&!d.isPausing)return console.log("⏸️ Stealth Typing: interrupted — processing stopped"),!1;const u=t[l],f=u.toLowerCase();if(/[a-z]/.test(f)&&Math.random()<.03){const x=Io[f]||[f],s=x[Math.floor(Math.random()*x.length)];n+=s,o?o.call(e,n):e.value=n,e.dispatchEvent(new Event("input",{bubbles:!0})),await T(80+Math.random()*60),await T(150+Math.random()*250),n=n.slice(0,-1),o?o.call(e,n):e.value=n,e.dispatchEvent(new Event("input",{bubbles:!0})),await T(60+Math.random()*50)}n+=u,o?o.call(e,n):e.value=n,e.dispatchEvent(new Event("input",{bubbles:!0}));const S=r+f;let m;Po.has(S)?m=50+Math.random()*40:u===" "?m=120+Math.random()*150:u===","||u==="."?m=150+Math.random()*200:m=80+Math.random()*120;const w=l-t.lastIndexOf(" ",l);w>5&&(m+=w*2),Math.random()<.03&&(m+=400+Math.random()*800),r=f,await T(m)}await T(400);const a=e.value;return a===t?console.log("✅ Stealth Typing: SUCCESS — text matches exactly"):(console.warn("⚠️ Stealth Typing: mismatch. Got:     ",JSON.stringify(a.substring(0,60))),console.warn("⚠️ Stealth Typing: Expected:",JSON.stringify(t.substring(0,60)))),!0}console.log("✅ TextInjector module loaded");function Co(e){console.log("✅ SubmitHandler initialized")}function Ro(){try{const e=document.querySelector('textarea[data-testid="composer-input"]');if(!e)return console.warn("⚠️ Composer textarea not found — cannot submit"),!1;e.focus();const t=new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:!0,cancelable:!0});return e.dispatchEvent(t),console.log("✅ Enter key dispatched on composer textarea — generation submitted"),!0}catch(e){return console.error("❌ Error in clickSubmit:",e),!1}}console.log("✅ SubmitHandler module loaded");function Lo(){console.log("✅ SettingsApplicator initialized (no-op)")}console.log("✅ SettingsApplicator module loaded");function Oo(e){const t=e.getBoundingClientRect(),o=(Math.random()-.5)*t.width*.6,n=(Math.random()-.5)*t.height*.6,r=t.left+t.width/2+o,a=t.top+t.height/2+n;console.log(`🎯 Stealth click at (${Math.round(r)}, ${Math.round(a)}) — offset (${Math.round(o)}px, ${Math.round(n)}px)`);const i={bubbles:!0,cancelable:!0,view:window,clientX:r,clientY:a,screenX:window.screenX+r,screenY:window.screenY+a,button:0};e.dispatchEvent(new PointerEvent("pointerdown",{...i,isPrimary:!0,buttons:1})),e.dispatchEvent(new MouseEvent("mousedown",{...i,buttons:1})),e.dispatchEvent(new PointerEvent("pointerup",{...i,isPrimary:!0,buttons:0})),e.dispatchEvent(new MouseEvent("mouseup",{...i,buttons:0})),e.dispatchEvent(new PointerEvent("click",{...i,isPrimary:!0})),e.dispatchEvent(new MouseEvent("click",i))}console.log("✅ ClickHelper module loaded");let Ze=null;const pt='input[type="file"][multiple].hidden',Ot='img[data-testid="media-attachment-image"]',_o='[aria-label="Remove attachment"]',Do=1e4,_t=300;function Vo(e){Ze=e,console.log("✅ ImageUploader initialized")}function Dt(){var t;return((t=(Ze?Ze():{}).settings)==null?void 0:t.stealthMode)===!0}function $o(e){return Math.round(e*(.7+Math.random()*.6))}async function No(e){const t=Dt()?$o(e):e;return T(t)}function zo(e){Dt()?Oo(e):e.click()}async function Uo(){const e=[...document.querySelectorAll(_o)];if(e.length===0)return console.log("✅ ImageUploader Pre-flight: No attached references — already clean"),!1;console.log(`🧹 ImageUploader Pre-flight: Removing ${e.length} attachment(s)...`);for(const o of e)zo(o),await No(150);const t=Date.now();for(;Date.now()-t<5e3;){if(document.querySelectorAll(Ot).length===0)return console.log("✅ ImageUploader Pre-flight: All attachments cleared"),!0;await T(_t)}return console.warn("⚠️ ImageUploader Pre-flight: Some attachments may not have been cleared (timeout)"),!0}async function qo(e){if(!e||e.length===0)return console.warn("⚠️ ImageUploader.uploadAllImages: No images provided"),!1;console.log(`📤 ImageUploader: Injecting ${e.length} image(s) into Meta AI...`);const t=document.querySelector(pt);if(!t)return console.warn(`⚠️ ImageUploader: File input not found (${pt})`),!1;const o=new DataTransfer;for(let r=0;r<e.length;r++){const a=e[r],i=a.name||`reference_${r+1}.jpg`,l=a.mimeType||"image/jpeg",d=Fo(a.data,i,l);if(!d){console.warn(`⚠️ ImageUploader: Failed to convert "${i}" to File — skipping`);continue}o.items.add(d),console.log(`📁 ImageUploader [${r+1}/${e.length}]: "${i}" (${(d.size/1024).toFixed(1)} KB) queued`)}return o.files.length===0?(console.error("❌ ImageUploader: No valid files to inject"),!1):(t.files=o.files,t.dispatchEvent(new Event("change",{bubbles:!0})),console.log(`📤 ImageUploader: Dispatched change event with ${o.files.length} file(s)`),await Yo(Ot,Do)?(console.log(`✅ ImageUploader: ${e.length} image(s) attached to Meta AI composer`),!0):(console.warn("⚠️ ImageUploader: Preview thumbnail did not appear — files may still be attached"),!0))}async function Go(e,t){return console.log("⏩ ImageUploader Phase 2: Skipped — Meta AI auto-attaches images after injection"),!0}async function Yo(e,t){const o=Date.now();for(;Date.now()-o<t;){const n=document.querySelector(e);if(n)return n;await T(_t)}return null}function Fo(e,t,o){try{let n=e,r=o;if(e.startsWith("data:")){const[l,d]=e.split(",");n=d;const u=l.match(/:(.*?);/);u&&(r=u[1])}const a=atob(n),i=new Uint8Array(a.length);for(let l=0;l<a.length;l++)i[l]=a.charCodeAt(l);return new File([i],t,{type:r})}catch(n){return console.error("❌ ImageUploader: base64ToFile conversion failed:",n),null}}console.log("✅ ImageUploader module loaded");const Vt=[],$t=[];function jo(e){const t=e.querySelector('a[aria-label="View media"]');return t?t.getAttribute("href"):null}function Ho(e,t){const o=[],n=document.querySelectorAll('div[data-testid="ecto-sand-loader"]'),r=new Set,a=Array.from(n).map(i=>{var l,d;return i.closest('[class*="group/media-item"]')||((d=(l=i.parentElement)==null?void 0:l.parentElement)==null?void 0:d.parentElement)}).filter(i=>!i||r.has(i)?!1:(r.add(i),!0));for(const i of a){const l=jo(i);if(!(!l||e!=null&&e.has(l)||t!=null&&t.has(l)||i.querySelector('img[data-testid="generated-image"]')||i.querySelector("video"))){for(const u of Vt)if(u.detect(i)){t==null||t.add(l),o.push({tileId:l,type:u.type,label:u.label}),console.warn(`⚠️ ErrorScanner: tile ${l} — ${u.label}`);break}}}return{errorCount:o.length,errors:o}}function Bo(){for(const e of $t)if(e.detect())return console.error(`❌ ErrorScanner: global error — ${e.label} (severity: ${e.severity})`),{found:!0,type:e.type,label:e.label,severity:e.severity};return{found:!1,type:null,label:null,severity:null}}console.log(`✅ ErrorScanner module loaded — ${Vt.length} tile pattern(s), ${$t.length} global pattern(s)`);let M=null,h=null,y=null,Ve=null,$e=null,qe=[],Je=!1;function Nt({getState:e,setState:t,getSelectors:o,eventBus:n,stateManager:r}){M=e,h=n,y=r,n.on(c.PROCESSING_TERMINATE,()=>{Ce(),ge(),lt()}),console.log("✅ MonitoringExport initialized")}async function Ko(){const e=new Set;return document.querySelectorAll('a[aria-label="View media"]').forEach(t=>{const o=t.getAttribute("href");o&&e.add(o)}),console.log(`📸 Tile snapshot: ${e.size} existing tile(s)`),e}function Qo(e){return!!e.querySelector('img[data-testid="generated-image"], div[data-testid="generated-video"]')}function zt(e){return!!e.querySelector("video")}function Ut(e){const t=[],o=new Set;document.querySelectorAll('a[aria-label="View media"]').forEach(r=>{const l=r.getAttribute("href");if(!l||o.has(l))return;o.add(l);if(e!=null&&e.has(l))return;// Walk up to find the media-item container
let d=r.parentElement;for(let i=0;i<6;i++){if(!d)break;if(d.classList&&(Array.from(d.classList).some(c=>c.includes("media-item"))||d.querySelector('img[data-testid="generated-image"],div[data-testid="generated-video"],video')))break;d=d.parentElement;}if(!d)return;// Must have completed media
const hasImg=d.querySelector('img[data-testid="generated-image"]');const hasVid=d.querySelector('div[data-testid="generated-video"],video');if(!hasImg&&!hasVid)return;t.push({tileId:l,tileEl:d,isVideo:zt(d)})});return t}async function Wo(e,t){var l;const o=qt(t),n=e.querySelector('div[data-testid="generated-video"]'),r=n==null?void 0:n.getAttribute("data-video-url");if(r!=null&&r.startsWith("http"))return chrome.runtime.sendMessage({action:"downloadVideo",url:r,filename:`${o}.mp4`}),console.log("✅ Video download triggered via CDN URL"),!0;const a=e.querySelector('button[aria-label="Download"]');if(a)return a.click(),console.log("✅ Image download button clicked"),!0;const i=e.querySelector('img[data-testid="generated-image"]');return(l=i==null?void 0:i.src)!=null&&l.startsWith("http")?(chrome.runtime.sendMessage({action:"downloadImage",url:i.src,filename:`${o}.jpg`}),console.log("✅ Image download triggered via CDN URL fallback"),!0):(console.warn("⚠️ Could not download tile — no CDN URL and no Download button found"),!1)}function qt(e){return e?e.trim().replace(/[\\/:*?"<>|,]/g,"").replace(/\s+/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,"").substring(0,80)||`download_${Date.now()}`:`download_${Date.now()}`}async function Gt(e,t=null,o=""){try{return await Wo(e,o)}catch(n){return console.error("❌ Error in downloadTileViaUI:",n),!1}}async function Xo(){if(!Je){for(Je=!0;qe.length>0;){const{tileEl:e,targetQuality:t,label:o,prompt:n}=qe.shift();console.log(`⬇️ Download runner: processing "${o}"`),await Gt(e,t,n),await T(500)}lt(),console.log("✅ Download runner: queue empty, state reset")}}const ft={image:{stall:3e4,zeroTiles:6e4},video:{stall:9e4,zeroTiles:18e4}};async function Yt(){var t,o,n,r,a,i,l,d,u,f,S,m,w,x;const e=M?M():{};if(!(!e.isProcessing&&!e.isPausing))try{const s=(t=e.taskList)==null?void 0:t.find(I=>I.status==="current");if(!s)return;s.foundVideos||(s.foundVideos=0),s.processedTileIds||(s.processedTileIds=new Set),s._scanStartedAt||(s._scanStartedAt=Date.now(),h==null||h.emit(c.OVERLAY_ERROR_BANNER_CLEAR));const L=!!((o=s.settings)!=null&&o.directVideo),{stall:D,zeroTiles:Y}=L?ft.video:ft.image,ne=e.preSubmitTileIds||new Set,re=Ut(ne);let ie=!1;for(const{tileId:I,tileEl:Q,isVideo:Oe}of re){if(s.processedTileIds.has(I))continue;s.processedTileIds.add(I),s.foundVideos+=1,s._lastFoundAt=Date.now(),ie=!0;const ae=Oe?"Video":"Image";if(console.log(`✅ New ${ae} detected: tile ${I} (${s.foundVideos}/${s.expectedVideos})`),h==null||h.emit(c.OVERLAY_MESSAGE,`✅ ${ae} ${s.foundVideos}/${s.expectedVideos} for Task ${s.index}`),chrome.runtime.sendMessage({action:"updateStatus",status:`${ae} ${s.foundVideos}/${s.expectedVideos} captured for Task ${s.index}`}),((n=e.settings)==null?void 0:n.autoDownload)!==!1){const W="imageDownloadQuality",io=((r=s.settings)==null?void 0:r[W])||((a=e.settings)==null?void 0:a[W])||"1K";qe.push({tileEl:Q,targetQuality:io,label:`${ae} ${I}`,prompt:s.prompt||""}),Xo()}(i=y==null?void 0:y.sendTaskUpdate)==null||i.call(y,s)}const{errorCount:Re,errors:mt}=Ho(ne,s.processedTileIds);if(Re>0){s.foundVideos+=Re,s._lastFoundAt=Date.now(),ie=!0;for(const z of mt)console.warn(`⚠️ Tile error: [${z.type}] ${z.label} (tile ${z.tileId})`);const I=s.foundVideos,Q=s.expectedVideos,Oe=mt.reduce((z,W)=>(z[W.label]=(z[W.label]||0)+1,z),{}),ae=Object.entries(Oe).map(([z,W])=>`• ${W}× ${z}`);h==null||h.emit(c.OVERLAY_ERROR_BANNER,{lines:ae,taskIndex:s.index}),h==null||h.emit(c.OVERLAY_MESSAGE,`⚠️ ${Re} tile error(s) — ${I}/${Q} resolved`),chrome.runtime.sendMessage({action:"updateStatus",status:`Task ${s.index}: ${Re} error tile(s) — ${JSON.stringify(Oe)} — ${I}/${Q} resolved`}),(l=y==null?void 0:y.sendTaskUpdate)==null||l.call(y,s)}const F=Bo();if(F.found){if(console.error(`❌ Global error: [${F.type}] ${F.label} (severity: ${F.severity})`),h==null||h.emit(c.OVERLAY_MESSAGE,`❌ ${F.label}`),F.severity==="skip_task"&&s.status==="current"){s.status="error",(d=y==null?void 0:y.sendTaskUpdate)==null||d.call(y,s),_e(s,e.currentPromptIndex);return}if(F.severity==="pause_processing"){h==null||h.emit(c.PROCESSING_STOP);return}if(F.severity==="terminate"){h==null||h.emit(c.PROCESSING_TERMINATE);return}}const Le=Date.now(),We=s.expectedVideos-s.foundVideos,j=L?"video":"image";if(s.foundVideos>=s.expectedVideos&&s.status==="current"){if(s.status="processed",console.log(`✅ Task ${s.index} COMPLETE (${s.foundVideos}/${s.expectedVideos} ${j}(s))`),(u=y==null?void 0:y.sendTaskUpdate)==null||u.call(y,s),(((f=s.settings)==null?void 0:f.autoAnimate)??((m=(S=e.settings)==null?void 0:S.image)==null?void 0:m.autoAnimate)??!1)&&(Ce(),ge(),await nn(s,s.foundVideos)))return;_e(s,e.currentPromptIndex);return}if(s.foundVideos>0&&s._lastFoundAt&&Le-s._lastFoundAt>D&&s.status==="current"){s.status="processed",console.warn(`⚠️ Task ${s.index}: stall timeout — ${s.foundVideos}/${s.expectedVideos} ${j}(s) (${We} failed)`),h==null||h.emit(c.OVERLAY_MESSAGE,`⚠️ Task ${s.index}: ${s.foundVideos}/${s.expectedVideos} ${j}s — ${We} failed. Continuing...`),chrome.runtime.sendMessage({action:"updateStatus",status:`Task ${s.index}: partial (${s.foundVideos}/${s.expectedVideos} ${j}s). Moving on.`}),(w=y==null?void 0:y.sendTaskUpdate)==null||w.call(y,s),_e(s,e.currentPromptIndex);return}if(s.foundVideos===0&&s._scanStartedAt&&Le-s._scanStartedAt>Y&&s.status==="current"){s.status="error";const I=(Y/6e4).toFixed(1);console.error(`❌ Task ${s.index}: zero ${j}s after ${I} min.`),h==null||h.emit(c.OVERLAY_MESSAGE,`❌ Task ${s.index}: no ${j}s generated after ${I} min. Skipping...`),chrome.runtime.sendMessage({action:"updateStatus",status:`Task ${s.index}: all ${s.expectedVideos} ${j}(s) failed (${I}min). Skipping.`}),(x=y==null?void 0:y.sendTaskUpdate)==null||x.call(y,s),_e(s,e.currentPromptIndex);return}if(s.foundVideos>0&&s._lastFoundAt&&!ie){const I=Math.round((Le-s._lastFoundAt)/1e3),Q=Math.round((D-(Le-s._lastFoundAt))/1e3);I>0&&I%30<5&&console.log(`⏳ Task ${s.index} [${j}]: waiting for ${We} more — stalled ${I}s, timeout in ${Q}s`)}}catch(s){console.error("❌ Error in periodicTileScanner:",s)}}function Zo(){Ce();const e=M?M():{};if(!e.isProcessing&&!e.isPausing)return;const t=e.scanIntervalMs||5e3;console.log(`🔍 Starting tile scanner (every ${t/1e3}s)`),Ve=setInterval(Yt,t)}function Ce(){Ve&&(clearInterval(Ve),Ve=null,console.log("🛑 Tile scanner stopped"))}function lt(){qe=[],Je=!1}async function Jo(){return await T(2e3),null}function en(){ge(),console.log("🔍 Starting error monitoring..."),$e=setInterval(()=>{const e=M?M():{};!e.isProcessing&&!e.isPausing&&ge()},5e3)}function ge(){$e&&(clearInterval($e),$e=null,console.log("🛑 Error monitoring stopped"))}const ht=6e4,tn=3e3;function on(e){const t=e.querySelectorAll("button");for(const o of t){const n=o.querySelector("span.truncate");if(n&&n.textContent.trim()==="Animate")return o.click(),!0}return!1}async function nn(e,t){var f,S;const n=(M?M():{}).preSubmitTileIds||new Set,r=Array.from(document.querySelectorAll("div.group\\/media-item")).filter(m=>{var x;const w=(x=m.querySelector('a[aria-label="View media"]'))==null?void 0:x.getAttribute("href");return w&&!n.has(w)&&m.querySelector('img[data-testid="generated-image"]')});if(r.length===0){console.warn("⚠️ [AutoAnimate] No image cards found for current task — skipping animate");return}const a=new Set(Array.from(document.querySelectorAll('a[aria-label="View media"]')).map(m=>m.getAttribute("href")).filter(Boolean)),i=r.length;console.log(`🎬 [AutoAnimate] Task ${e.index}: found ${r.length} image card(s) to animate (pre-animate card snapshot: ${a.size})`),h==null||h.emit(c.OVERLAY_MESSAGE,`🎬 Animating ${r.length} image(s) for Task ${e.index}...`),chrome.runtime.sendMessage({action:"updateStatus",status:`Task ${e.index}: animating ${r.length} image(s)...`});for(const m of r)on(m)||console.warn("⚠️ [AutoAnimate] Animate button not found on a card — skipping that card"),await T(500);const l=Date.now();let d=[];for(;Date.now()-l<ht;){await T(tn);const m=M?M():{};if(!m.isProcessing&&!m.isPausing){console.log("⏸️ [AutoAnimate] Processing stopped — exiting animate wait");return}d=Array.from(document.querySelectorAll("div.group\\/media-item")).filter(x=>{var L;const s=(L=x.querySelector('a[aria-label="View media"]'))==null?void 0:L.getAttribute("href");return s&&!a.has(s)&&x.querySelector('div[data-testid="generated-video"]')});const w=Math.round((Date.now()-l)/1e3);if(console.log(`⏳ [AutoAnimate] ${d.length}/${i} new video card(s) appeared (${w}s)`),h==null||h.emit(c.OVERLAY_MESSAGE,`🎬 Animating: ${d.length}/${i} done for Task ${e.index} (${w}s)`),d.length>=i)break}if(d.length>=i){if(console.log(`✅ [AutoAnimate] All ${i} video card(s) appeared for Task ${e.index}`),h==null||h.emit(c.OVERLAY_MESSAGE,`✅ All images animated for Task ${e.index}`),((f=(M?M():{}).settings)==null?void 0:f.autoDownload)!==!1){const w=qt(e.prompt);d.forEach((x,s)=>{const L=x.querySelector('div[data-testid="generated-video"]'),D=L==null?void 0:L.getAttribute("data-video-url");if(D!=null&&D.startsWith("http")){const Y=`${w}_animated_${s+1}.mp4`;chrome.runtime.sendMessage({action:"downloadVideo",url:D,filename:Y}),console.log(`⬇️ [AutoAnimate] Downloading video ${s+1}/${d.length}: ${Y}`)}})}}else{const m=(ht/6e4).toFixed(0);return console.warn(`⚠️ [AutoAnimate] ${m}min timeout — saving recheck state and reloading page`),h==null||h.emit(c.OVERLAY_MESSAGE,`🔄 Animate timeout for Task ${e.index} — refreshing to recheck...`),await new Promise(w=>{chrome.storage.local.set({animateRecheckState:{taskIndex:e.index,expectedNewVideos:i,preAnimateCardIds:Array.from(a)}},w)}),await((S=y==null?void 0:y.saveStateToStorage)==null?void 0:S.call(y)),chrome.runtime.sendMessage({action:"reloadForAnimateRecheck"}).catch(()=>{}),!0}}function _e(e,t){(M?M():{}).isCurrentPromptProcessed||(Ce(),ge(),setTimeout(()=>{const n=M?M():{};(n.isProcessing||n.isPausing)&&(h==null||h.emit(c.TASK_COMPLETED,{task:e,taskIndex:t}))},500))}console.log('✅ MonitoringExport module loaded (Meta AI — img[data-testid="generated-image"] tile scanner)');const Ft=Object.freeze(Object.defineProperty({__proto__:null,checkForErrorsAfterSubmit:Jo,downloadTileViaUI:Gt,init:Nt,isTileCompleted:Qo,isTileVideo:zt,periodicTileScanner:Yt,resetDownloadQueue:lt,scanForNewlyCompletedTiles:Ut,snapshotExistingTileIds:Ko,startErrorMonitoring:en,startTileScanner:Zo,stopErrorMonitoring:ge,stopTileScanner:Ce},Symbol.toStringTag,{value:"Module"}));let Z=null,O=null,g=null,v=null,C=null;function rn({getState:e,setState:t,eventBus:o,monitoring:n,stateManager:r}){Z=e,O=t,g=o,v=n,C=r,console.log("✅ TaskRunner initialized")}async function jt(e,t){var l,d,u,f;if(!e){console.error("❌ TaskRunner: No task provided"),g==null||g.emit(c.TASK_ERROR,{task:null,reason:"no_task"});return}const o=e.prompt;O==null||O({currentProcessingPrompt:o,currentTaskStartTime:Date.now()});const n=`Processing task ${e.index}: "${o==null?void 0:o.substring(0,30)}${(o==null?void 0:o.length)>30?"...":""}"`;if(console.log(`📌 Task ${e.index} started`),g==null||g.emit(c.OVERLAY_MESSAGE,n),e.referenceImages&&((l=e.referenceImages.images)==null?void 0:l.length)>0){const S=e.referenceImages.mode||"single",m=e.referenceImages.images.filter(Boolean);if(m.length>0){if(console.log(`🧹 Step 1.5 pre-flight: Clearing any existing attached references for Task ${e.index}...`),g==null||g.emit(c.OVERLAY_MESSAGE,"Step 1.5/4: Clearing previous references..."),await Uo(),console.log(`🖼️ Step 1.5a/4: Checking/uploading ${m.length} file(s) into Meta AI [${S}] for Task ${e.index}...`),g==null||g.emit(c.OVERLAY_MESSAGE,`Step 1.5/4: Uploading ${m.length} reference image(s) to library...`),!await qo(m)){const s=Z==null?void 0:Z();if(!(s!=null&&s.isProcessing)&&!(s!=null&&s.isPausing)){console.log("⏸️ Processing stopped during file injection");return}console.error("❌ File injection failed — triggering retry"),g==null||g.emit(c.TASK_ERROR,{task:e,taskIndex:t,reason:"image_upload_failed"});return}if(console.log(`🔗 Step 1.5b/4: Attaching ${m.length} image(s) as references [${S}]...`),g==null||g.emit(c.OVERLAY_MESSAGE,`Step 1.5/4: Attaching ${m.length} reference image(s)...`),!await Go()){const s=Z==null?void 0:Z();if(!(s!=null&&s.isProcessing)&&!(s!=null&&s.isPausing)){console.log("⏸️ Processing stopped during reference attachment");return}console.error("❌ Reference attachment failed — triggering retry"),g==null||g.emit(c.TASK_ERROR,{task:e,taskIndex:t,reason:"image_attach_failed"});return}console.log(`✅ All ${m.length} reference image(s) [${S}] uploaded and attached`),await T(500)}}if(console.log(`📝 Step 2/4: Injecting prompt for Task ${e.index}...`),g==null||g.emit(c.OVERLAY_MESSAGE,"Step 2/4: Adding prompt..."),!await ko(o)){console.error("❌ Text injection failed — triggering retry"),g==null||g.emit(c.TASK_ERROR,{task:e,taskIndex:t,reason:"inject_failed"});return}if(await T(1e3),C==null||C.updateTask(t,{status:"current"}),g==null||g.emit(c.TASK_START,{task:((d=C==null?void 0:C.getCurrentTask)==null?void 0:d.call(C))??e,taskIndex:t}),console.log(`📋 Task ${e.index} status: current`),console.log(`🚀 Step 3/4: Submitting Task ${e.index}...`),g==null||g.emit(c.OVERLAY_MESSAGE,"Step 3/4: Submitting..."),v!=null&&v.snapshotExistingTileIds){const S=await v.snapshotExistingTileIds();O==null||O({preSubmitTileIds:S}),console.log(`📸 Pre-submit tile snapshot: ${S.size} existing tile(s)`)}if(!await Ro()){console.error("❌ Submit failed — triggering retry"),g==null||g.emit(c.TASK_ERROR,{task:e,taskIndex:t,reason:"submit_failed"});return}console.log(`✅ Submitted prompt: "${o}"`),console.log("🔍 Step 4/4: Monitoring for completion..."),g==null||g.emit(c.OVERLAY_MESSAGE,"Step 4/4: Monitoring generation...");const i=v!=null&&v.checkForErrorsAfterSubmit?await v.checkForErrorsAfterSubmit():null;if(i==="QUEUE_FULL")return console.warn("⚠️ Queue full — waiting 30 seconds before retry..."),g==null||g.emit(c.OVERLAY_MESSAGE,"Queue is full. Waiting 30 seconds before retry..."),await T(3e4),jt(e,t);if(i==="POLICY_PROMPT"){console.error("❌ Prompt violates policy — skipping"),g==null||g.emit(c.OVERLAY_MESSAGE,"⚠️ Policy violation detected. Skipping this prompt..."),C==null||C.updateTask(t,{status:"error"}),C==null||C.sendTaskUpdate(e),g==null||g.emit(c.TASK_SKIPPED,{task:e,taskIndex:t,reason:"policy_violation"}),chrome.runtime.sendMessage({action:"updateStatus",status:`Policy violation on prompt: "${o==null?void 0:o.substring(0,30)}..."`}),await T(3e3),O==null||O({isCurrentPromptProcessed:!0}),g==null||g.emit(c.TASK_COMPLETED,{task:e,taskIndex:t});return}console.log("✅ No errors detected, starting tile scanner..."),(u=v==null?void 0:v.startTileScanner)==null||u.call(v),(f=v==null?void 0:v.startErrorMonitoring)==null||f.call(v),console.log("⏳ Generating... scanning for results"),g==null||g.emit(c.OVERLAY_MESSAGE,"Generating... scanning for results"),O==null||O({currentRetries:0})}console.log("✅ TaskRunner module loaded");let p=null,R=null,A=null,we=null;const et=3,an=5e3,sn=15e3;function ln({stateManager:e,eventBus:t,monitoring:o}){p=e,R=t,A=o,t.on(c.QUEUE_NEXT,()=>Ge()),t.on(c.TASK_START,dn),t.on(c.TASK_COMPLETED,Kt),t.on(c.TASK_SKIPPED,un),t.on(c.TASK_ERROR,mn),t.on(c.PROCESSING_STOP,bt),t.on(c.PROCESSING_TERMINATE,bt),console.log("✅ QueueController initialized")}function Ge(){var r;const e=p.getState();p.setState({isCurrentPromptProcessed:!1});const t=e.taskList.length>0?e.taskList.length:e.prompts.length;if(!e.isProcessing||e.currentPromptIndex>=t){p.setState({isProcessing:!1}),Bt(),R.emit(c.OVERLAY_HIDE),e.currentPromptIndex>=t&&(chrome.runtime.sendMessage({action:"updateStatus",status:"All Meta AI prompts completed successfully!"}),chrome.runtime.sendMessage({action:"resetPageZoom"}).catch(()=>{}),R.emit(c.PAGE_ZOOM_CHANGED,{zoom:1}),(r=p.clearStateFromStorage)==null||r.call(p),R.emit(c.PROCESSING_COMPLETE));return}const o=e.prompts[e.currentPromptIndex]||"",n=o.length>30?o.substring(0,30)+"...":o;R.emit(c.OVERLAY_SHOW,`Processing: "${n}"`),e.currentPromptIndex===0&&(chrome.runtime.sendMessage({action:"setPageZoom",zoomFactor:.67}).catch(()=>{}),R.emit(c.PAGE_ZOOM_CHANGED,{zoom:.67})),chrome.storage.local.get("quotaStatus",a=>{var l,d,u;const i=a.quotaStatus||{canContinue:!0,isPaid:!1};if(i.isPaid){wt();return}wt()})}async function cn(){var u,f,S,m,w,x;const e=p.getState();if(!e.isCurrentPromptProcessed)return;(u=A==null?void 0:A.stopTileScanner)==null||u.call(A);const t=e.currentPromptIndex+1,o=e.taskList.length>0?e.taskList.length:e.prompts.length;if(p.setState({currentPromptIndex:t}),Bt(),(f=p.saveStateToStorage)==null||f.call(p),!p.getState().isProcessing){(S=A==null?void 0:A.stopTileScanner)==null||S.call(A),(m=A==null?void 0:A.stopErrorMonitoring)==null||m.call(A),p.setState({isPausing:!1}),R.emit(c.OVERLAY_HIDE),chrome.runtime.sendMessage({action:"updateStatus",status:"Processing paused. Click Resume to continue."});return}const r=((w=e.settings)==null?void 0:w.autoClearCache)??!1,a=((x=e.settings)==null?void 0:x.autoClearCacheInterval)??50;if(r&&t>0&&t%a===0&&t<o){console.log(`🗑️ Auto-clear cache milestone: task ${t}/${o} — sending clearFlowCache (fire-and-forget)`),R.emit(c.OVERLAY_MESSAGE,`🧹 Clearing Meta AI cache (milestone: task ${t}/${o})...`),chrome.runtime.sendMessage({action:"updateStatus",status:`Task ${t} complete — clearing cache for performance...`}),chrome.runtime.sendMessage({action:"clearFlowCache"},s=>{chrome.runtime.lastError});return}if(t>=o){console.log("✅ All tasks done — skipping inter-task countdown"),Ge();return}const i=p.getState(),l=i.taskList.length>0&&i.currentPromptIndex<i.taskList.length?i.taskList[i.currentPromptIndex]:null,d=p.getRandomDelay?p.getRandomDelay(l,i.settings):sn;R.emit(c.COUNTDOWN_START,{ms:d,label:"next prompt"}),we=setTimeout(()=>{we=null,p.getState().isProcessing&&Ge()},d)}function Ht(){var t,o,n;const e=p.getState();if(e.currentRetries<et){p.setState({currentRetries:e.currentRetries+1});const a=`Retry ${p.getState().currentRetries}/${et}: Waiting for Meta AI interface...`;R.emit(c.OVERLAY_MESSAGE,a),chrome.runtime.sendMessage({action:"updateStatus",status:a}),setTimeout(Ge,an)}else{R.emit(c.OVERLAY_HIDE);const r=(t=p.getCurrentTask)==null?void 0:t.call(p);r&&((o=p.updateTask)==null||o.call(p,e.currentPromptIndex,{status:"error"}),(n=p.sendTaskUpdate)==null||n.call(p,r)),chrome.runtime.sendMessage({action:"error",error:"Unable to find Meta AI interface elements after multiple attempts. Make sure you are on the correct page."}),p.setState({isProcessing:!1})}}function Bt(){const e=p.getState(),t=Math.min(e.currentPromptIndex,e.prompts.length);(e.isProcessing||e.isPausing)&&R.emit(c.PROGRESS_UPDATE,{currentIndex:t}),chrome.runtime.sendMessage({action:"updateProgress",currentPrompt:t<e.prompts.length?e.prompts[t]:"",processed:t,total:e.prompts.length})}function dn({task:e}){e!=null&&e.queueTaskId&&chrome.runtime.sendMessage({action:"taskStatusUpdate",taskId:e.queueTaskId,status:"current"}).catch(()=>{})}function Kt({task:e,taskIndex:t}){var n,r,a,i;const o=p.getState();o.isCurrentPromptProcessed||(console.log(`✅ Queue: Task ${e==null?void 0:e.index} completed — moving to next`),e!=null&&e.queueTaskId&&chrome.runtime.sendMessage({action:"taskStatusUpdate",taskId:e.queueTaskId,status:"processed"}).catch(()=>{}),R.emit(c.OVERLAY_MESSAGE,`✅ All outputs captured for Task ${e==null?void 0:e.index}`),chrome.runtime.sendMessage({action:"updateStatus",status:`All outputs captured for prompt: "${(r=(n=o.prompts)==null?void 0:n[o.currentPromptIndex])==null?void 0:r.substring(0,30)}..."`}),p.setState({isCurrentPromptProcessed:!0,currentProcessingPrompt:null}),(a=A==null?void 0:A.stopTileScanner)==null||a.call(A),(i=A==null?void 0:A.stopErrorMonitoring)==null||i.call(A),setTimeout(()=>{const l=p.getState();(l.isProcessing||l.isPausing)&&cn()},1e3))}function un({task:e,taskIndex:t}){e!=null&&e.queueTaskId&&chrome.runtime.sendMessage({action:"taskStatusUpdate",taskId:e.queueTaskId,status:"processed"}).catch(()=>{}),Kt({task:e,taskIndex:t})}function mn({task:e,taskIndex:t,reason:o}){console.warn(`⚠️ Queue: Task ${e==null?void 0:e.index} error — reason: ${o}`),p.getState().currentRetries>=et-1&&(e!=null&&e.queueTaskId)&&chrome.runtime.sendMessage({action:"taskStatusUpdate",taskId:e.queueTaskId,status:"error"}).catch(()=>{}),Ht()}function bt(){var e;we!==null&&(clearTimeout(we),we=null,console.log("⏹️ QueueController: inter-task delay cancelled")),(e=p.clearCountdownTimer)==null||e.call(p)}function wt(){var o;const e=p.getState(),t=(o=p.getCurrentTask)==null?void 0:o.call(p);if(!t){console.error("❌ QueueController: No task at current index"),Ht();return}jt(t,e.currentPromptIndex)}console.log("✅ QueueController module loaded");let Qt=null,yt=null,Ae=null,tt=null,pe=1;function gn(e){pe=e||1;const t=1/pe;["meta-status-toast","meta-click-notice","meta-click-blocker","meta-glow-top","meta-glow-right","meta-glow-bottom","meta-glow-left"].forEach(n=>{const r=document.getElementById(n);r&&(r.style.zoom=t)})}function pn(e,t){e.getState,e.setState,Qt=e.clearCountdownTimer,yt=e,t.on(c.OVERLAY_SHOW,o=>In(o)),t.on(c.OVERLAY_HIDE,()=>Pn()),t.on(c.OVERLAY_MESSAGE,o=>Et(o)),t.on(c.OVERLAY_PAUSING,()=>Mn()),t.on(c.OVERLAY_ERROR_BANNER,o=>Cn(o)),t.on(c.OVERLAY_ERROR_BANNER_CLEAR,()=>eo()),t.on(c.PAGE_ZOOM_CHANGED,({zoom:o})=>gn(o)),t.on(c.COUNTDOWN_START,({ms:o,label:n})=>{yt.startCountdown(o,n)}),t.on(c.PROGRESS_UPDATE,({currentIndex:o})=>{Et(void 0)}),console.log("✅ OverlayManager module initialized")}function Wt(){if(document.getElementById("meta-overlay-styles"))return;const e=document.createElement("style");e.id="meta-overlay-styles",e.textContent=`
    @keyframes metaGlowPulse {
      0%, 100% { opacity: 0.6; }
      50%       { opacity: 1;   }
    }
    @keyframes metaToastIn {
      from { opacity: 0; transform: translateY(16px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)    scale(1);    }
    }
    @keyframes metaToastOut {
      from { opacity: 1; transform: translateY(0)    scale(1);    }
      to   { opacity: 0; transform: translateY(10px) scale(0.97); }
    }
    @keyframes metaNoticeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0);   }
    }
    @keyframes metaNoticeOut {
      from { opacity: 1; }
      to   { opacity: 0; }
    }
    @keyframes metaSpin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .meta-spin { animation: metaSpin 1s linear infinite; }
  `,document.head.appendChild(e)}const fn=.2,Ye=0,Fe=130,je=251,hn=160,bn=51,wn=255;let ct="running",Te=0,ye=null;const U=[{id:"meta-glow-top",start:0,end:null},{id:"meta-glow-right",start:null,end:null},{id:"meta-glow-bottom",start:null,end:null},{id:"meta-glow-left",start:null,end:1}];function yn(){const e=window.innerWidth,t=window.innerHeight,o=2*(e+t),n=e/o,r=(e+t)/o,a=(2*e+t)/o;U[0].start=0,U[0].end=n,U[1].start=n,U[1].end=r,U[2].start=r,U[2].end=a,U[3].start=a,U[3].end=1}function En(e,t,o,n){const r=t-e;let a=0;const i=o<0?[{t:o+1,h:1},{t:0,h:n}]:[{t:o,h:n}];for(const{t:l,h:d}of i){const u=Math.max(l,e),f=Math.min(d,t);f>u&&(a+=f-u)}return Math.min(a/r,1)}function Sn(){const e=Te-fn;for(const t of U){const o=document.getElementById(t.id);if(!o)continue;const n=En(t.start,t.end,e,Te),r=Math.round(Ye+(hn-Ye)*n),a=Math.round(Fe+(bn-Fe)*n),i=Math.round(je+(wn-je)*n),l=.7+n*.25,d=.3+n*.2,u=n>0?`${8+n*14}px`:"8px",f=n>0?`${18+n*20}px`:"18px";o.style.boxShadow=`0 0 22px ${u} rgba(${r},${a},${i},${l.toFixed(2)}), 0 0 50px ${f} rgba(${r},${a},${i},${d.toFixed(2)})`}}function Xt(){yn();const e=ct==="pausing"?.0042:.0028;function t(){Te=(Te+e)%1,Sn(),ye=requestAnimationFrame(t)}ye=requestAnimationFrame(t)}function Zt(){ye!==null&&(cancelAnimationFrame(ye),ye=null)}function xn(){if(document.getElementById("meta-glow-top"))return;const e=[{id:"meta-glow-top",css:"top:0;left:0;right:0;height:1px;"},{id:"meta-glow-right",css:"top:0;right:0;bottom:0;width:1px;"},{id:"meta-glow-bottom",css:"bottom:0;left:0;right:0;height:1px;"},{id:"meta-glow-left",css:"top:0;left:0;bottom:0;width:1px;"}];for(const{id:t,css:o}of e){const n=document.createElement("div");n.id=t,n.style.cssText=`
      position:fixed; z-index:999999997; pointer-events:none; background:transparent;
      box-shadow: 0 0 22px 8px rgba(${Ye},${Fe},${je},0.70),
                  0 0 50px 18px rgba(${Ye},${Fe},${je},0.30);
      animation: metaGlowPulse 2s ease-in-out infinite;
      zoom: ${1/pe};
      ${o}
    `,document.body.appendChild(n)}ct="running",Te=0,Xt()}function An(){Zt(),["meta-glow-top","meta-glow-right","meta-glow-bottom","meta-glow-left"].forEach(e=>{var t;return(t=document.getElementById(e))==null?void 0:t.remove()})}function Tn(e){ct=e,Zt(),Xt()}function kn(){if(document.getElementById("meta-click-blocker"))return;const e=document.createElement("div");e.id="meta-click-blocker",e.style.cssText=`
    position: fixed;
    inset: 0;
    z-index: 999999998;
    background: transparent;
    cursor: not-allowed;
    zoom: ${1/pe};
  `,e.addEventListener("click",Jt),document.body.appendChild(e)}function vn(){const e=document.getElementById("meta-click-blocker");e&&(e.removeEventListener("click",Jt),e.remove())}function Jt(){let e=document.getElementById("meta-click-notice");e?(e.style.animation="none",e.offsetHeight,e.style.animation="metaNoticeIn 0.2s ease forwards"):(e=document.createElement("div"),e.id="meta-click-notice",e.style.cssText=`
      position: fixed;
      top: 18px;
      left: 0;
      right: 0;
      margin-left: auto;
      margin-right: auto;
      width: fit-content;
      z-index: 999999999;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(8px);
      color: #e2e8f0;
      font-family: 'Google Sans', 'Roboto', -apple-system, sans-serif;
      font-size: 12px;
      font-weight: 500;
      padding: 7px 14px;
      border-radius: 20px;
      border: 1px solid rgba(0,130,251,0.40);
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 7px;
      white-space: nowrap;
      pointer-events: none;
      zoom: ${1/pe};
      animation: metaNoticeIn 0.2s ease forwards;
    `,e.innerHTML=`
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
           stroke="#0082FB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      Automation in progress — interaction blocked
    `,document.body.appendChild(e)),clearTimeout(tt),tt=setTimeout(()=>{const t=document.getElementById("meta-click-notice");t&&(t.style.animation="metaNoticeOut 0.3s ease forwards",setTimeout(()=>t==null?void 0:t.remove(),300))},1800)}function Qe(e,t="status"){Wt();let o=document.getElementById("meta-status-toast");const n=!o;n&&(o=document.createElement("div"),o.id="meta-status-toast",o.style.cssText=`
      position: fixed;
      bottom: 20px;
      left: 0;
      right: 0;
      margin-left: auto;
      margin-right: auto;
      width: fit-content;
      max-width: 480px;
      min-width: 200px;
      z-index: 999999999;
      font-family: 'Google Sans', 'Roboto', -apple-system, sans-serif;
      font-size: 12.5px;
      font-weight: 500;
      padding: 9px 16px;
      border-radius: 22px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12);
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      zoom: ${1/pe};
      animation: metaToastIn 0.25s cubic-bezier(0.25,0.8,0.25,1) forwards;
    `,document.body.appendChild(o));const r={status:{bg:"rgba(10,15,40,0.92)",border:"rgba(0,130,251,0.35)",color:"#e2e8f0",dot:"#0082FB"},error:{bg:"rgba(25,8,30,0.94)",border:"rgba(255,92,161,0.40)",color:"#ffd6ec",dot:"#FF5CA1"},pausing:{bg:"rgba(18,10,40,0.94)",border:"rgba(108,53,222,0.40)",color:"#ddd0ff",dot:"#6C35DE"}},a=r[t]||r.status;o.style.background=a.bg,o.style.border=`1px solid ${a.border}`,o.style.color=a.color,o.style.backdropFilter="blur(10px)",n||(o.style.animation="none",o.offsetHeight,o.style.animation="metaToastIn 0.2s cubic-bezier(0.25,0.8,0.25,1) forwards");const i=`<span style="
    width:7px; height:7px; border-radius:50%;
    background:${a.dot}; flex-shrink:0;
    box-shadow: 0 0 6px ${a.dot};
  "></span>`,l=t==="pausing"?`
    <svg class="meta-spin" width="13" height="13" viewBox="0 0 24 24" fill="none"
         stroke="${a.dot}" stroke-width="2.5" stroke-linecap="round">
      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9
               m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
    </svg>`:i;o.innerHTML=`${l}<span style="overflow:hidden;text-overflow:ellipsis">${e}</span>`,clearTimeout(Ae),t==="status"&&(Ae=setTimeout(()=>dt(),8e3))}function dt(){clearTimeout(Ae);const e=document.getElementById("meta-status-toast");e&&(e.style.animation="metaToastOut 0.25s ease forwards",setTimeout(()=>e==null?void 0:e.remove(),260))}function In(e){Wt(),xn(),kn(),e&&Qe(e,"status")}function Pn(){var e;Qt(),An(),vn(),dt(),(e=document.getElementById("meta-click-notice"))==null||e.remove(),clearTimeout(tt)}function Et(e){e&&document.getElementById("meta-glow-top")&&Qe(e,"status")}function Mn(){Tn("pausing"),Qe("Pausing — waiting for current task to finish...","pausing"),clearTimeout(Ae)}function Cn({lines:e=[],taskIndex:t="?"}={}){if(!document.getElementById("meta-glow-top"))return;eo();const o=e.length>0?e[0]:"Some generations failed",n=e.length>1?` (+${e.length-1} more)`:"",r=`⚠ Task ${t}: ${o}${n}`;Qe(r,"error"),clearTimeout(Ae)}function eo(){dt()}console.log("✅ OverlayManager module loaded");let K=!1,N=new Set,ue=null,He=null,te=!1,V=!1,J=!1,he=[],me=null;const ke="cdm-control-panel",ot="cdm-styles",fe="cdm-tile-overlay",Ee=e=>new Promise(t=>setTimeout(t,e));function Rn(e){return!!e.querySelector('img[data-testid="generated-image"]')||!!e.querySelector('[data-testid="generated-video"]')}function to(e){return!!e.querySelector("video")}function Ln(e){const t=e.getAttribute("data-cdm-id");if(t)return t;const o=e.querySelector('a[aria-label="View media"]');if(o){const a=(o.getAttribute("href")||"").match(/\/create\/(\d+)/);if(a){const i="meta-"+a[1];return e.setAttribute("data-cdm-id",i),i}}const n="cdm-"+crypto.randomUUID().slice(0,8);return e.setAttribute("data-cdm-id",n),n}function oe(){const e=[],t=new Set;return document.querySelectorAll('div[class*="group/media-item"]').forEach(o=>{if(!Rn(o))return;const n=Ln(o);t.has(n)||(t.add(n),e.push({tileId:n,tileEl:o,isVideo:to(o)}))}),e}function On(){if(document.getElementById(ot))return;const e=document.createElement("style");e.id=ot,e.textContent=`
    /* ── Tile checkbox overlay ──────────────────── */
    /* isolation: isolate on the tile itself creates a self-contained stacking
       context — all z-index values inside the tile are scoped within it, so
       the selection ring never paints over sibling page elements (e.g. textarea) */
    [data-cdm-id].cdm-isolated {
      isolation: isolate;
    }
    .cdm-tile-overlay {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 9999;
      pointer-events: none;
    }
    .cdm-tile-overlay.cdm-active {
      pointer-events: all;
      cursor: pointer;
    }
    .cdm-checkbox-wrap {
      position: absolute;
      top: 8px; left: 8px;
      width: 22px; height: 22px;
      z-index: 10001;
      display: flex; align-items: center; justify-content: center;
    }
    .cdm-checkbox {
      width: 18px; height: 18px;
      border-radius: 5px;
      border: 2px solid rgba(255,255,255,0.85);
      background: rgba(15,23,42,0.55);
      backdrop-filter: blur(4px);
      appearance: none; -webkit-appearance: none;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, transform 0.1s;
      flex-shrink: 0;
    }
    .cdm-checkbox:checked {
      background: #0082FB;
      border-color: #0082FB;
    }
    .cdm-checkbox:checked::after {
      content: '';
      display: block;
      margin: 2px auto 0 auto;
      width: 5px; height: 9px;
      border-right: 2px solid white;
      border-bottom: 2px solid white;
      transform: rotate(45deg);
    }
    .cdm-checkbox:hover { transform: scale(1.1); border-color: #a5b4fc; }
    .cdm-tile-selected-ring {
      position: absolute;
      inset: 0;
      border: 3px solid #0082FB;
      border-radius: 8px;
      pointer-events: none;
      box-shadow: inset 0 0 0 1px #a78bfa;
    }
    .cdm-tile-badge {
      position: absolute;
      top: 8px; right: 8px;
      background: rgba(15,23,42,0.70);
      backdrop-filter: blur(6px);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      padding: 2px 6px;
      font-size: 10px;
      font-weight: 600;
      color: #e2e8f0;
      font-family: 'Google Sans', sans-serif;
      pointer-events: none;
      letter-spacing: 0.3px;
    }

    /* ── Control panel ──────────────────────────── */
    @keyframes cdmPanelIn {
      0%   { opacity:0; transform: translateY(16px) scale(0.97); }
      100% { opacity:1; transform: translateY(0)    scale(1); }
    }
    #cdm-control-panel {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      border-radius: 20px;
      padding: 14px 18px;
      min-width: 360px;
      max-width: 92vw;
      min-height: 120px;
      width: 580px;
      box-sizing: border-box;
      resize: none;
      overflow: hidden;
      font-family: 'Google Sans', 'Roboto', -apple-system, sans-serif;
      animation: cdmPanelIn 0.3s cubic-bezier(0.25,0.8,0.25,1) forwards;
      display: flex;
      flex-direction: column;
      gap: 10px;
      user-select: none;
      transition: background 0.25s, border-color 0.25s, box-shadow 0.25s, color 0.25s;
    }

    /* ── DARK theme (default) ───────────────────── */
    #cdm-control-panel.cdm-dark {
      background: linear-gradient(145deg, rgba(15,23,42,0.97), rgba(30,41,59,0.95));
      backdrop-filter: blur(24px);
      border: 1px solid rgba(99,102,241,0.35);
      color: #e2e8f0;
      box-shadow:
        0 24px 60px rgba(0,0,0,0.55),
        0 8px 20px rgba(99,102,241,0.18),
        inset 0 1px 0 rgba(255,255,255,0.07);
    }
    #cdm-control-panel.cdm-dark .cdm-panel-title { color: #e2e8f0; }
    #cdm-control-panel.cdm-dark .cdm-stats       { color: #94a3b8; }
    #cdm-control-panel.cdm-dark .cdm-stat-chip   {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.09);
      color: #cbd5e1;
    }
    #cdm-control-panel.cdm-dark .cdm-stat-chip.cdm-selected {
      background: rgba(99,102,241,0.18);
      border-color: rgba(99,102,241,0.35);
      color: #a5b4fc;
    }
    #cdm-control-panel.cdm-dark .cdm-btn-secondary {
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.12);
      color: #cbd5e1;
    }
    #cdm-control-panel.cdm-dark .cdm-btn-secondary:hover {
      background: rgba(255,255,255,0.12);
      border-color: rgba(255,255,255,0.22);
      color: #e2e8f0;
    }
    #cdm-control-panel.cdm-dark .cdm-quality-label { color: #64748b; }
    #cdm-control-panel.cdm-dark .cdm-quality-select {
      background-color: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.12);
      color: #e2e8f0;
    }
    #cdm-control-panel.cdm-dark .cdm-quality-select:hover { border-color: rgba(99,102,241,0.5); }
    #cdm-control-panel.cdm-dark #cdm-progress-bar-track { background: rgba(255,255,255,0.08); }
    #cdm-control-panel.cdm-dark #cdm-progress-label     { color: #94a3b8; }

    /* ── LIGHT theme ──────────────────────────────── */
    #cdm-control-panel.cdm-light {
      background: linear-gradient(145deg, rgba(239,246,255,0.97), rgba(219,234,254,0.95));
      backdrop-filter: blur(24px);
      border: 1px solid rgba(99,102,241,0.25);
      color: #1e3a5f;
      box-shadow:
        0 24px 60px rgba(59,130,246,0.12),
        0 8px 20px rgba(99,102,241,0.10),
        inset 0 1px 0 rgba(255,255,255,0.80);
    }
    #cdm-control-panel.cdm-light .cdm-panel-title { color: #1e3a5f; }
    #cdm-control-panel.cdm-light .cdm-panel-title-icon {
      background: linear-gradient(135deg, #0082FB, #6C35DE);
    }
    #cdm-control-panel.cdm-light .cdm-stats       { color: #475569; }
    #cdm-control-panel.cdm-light .cdm-stat-chip   {
      background: rgba(99,102,241,0.08);
      border: 1px solid rgba(99,102,241,0.18);
      color: #334155;
    }
    #cdm-control-panel.cdm-light .cdm-stat-chip.cdm-selected {
      background: rgba(99,102,241,0.15);
      border-color: rgba(99,102,241,0.35);
      color: #4338ca;
    }
    #cdm-control-panel.cdm-light .cdm-btn-secondary {
      background: rgba(255,255,255,0.70);
      border: 1px solid rgba(99,102,241,0.20);
      color: #334155;
    }
    #cdm-control-panel.cdm-light .cdm-btn-secondary:hover {
      background: rgba(255,255,255,0.90);
      border-color: rgba(99,102,241,0.40);
      color: #1e293b;
    }
    #cdm-control-panel.cdm-light .cdm-quality-label { color: #64748b; }
    #cdm-control-panel.cdm-light .cdm-quality-select {
      background-color: rgba(255,255,255,0.75);
      border: 1px solid rgba(99,102,241,0.20);
      color: #1e293b;
    }
    #cdm-control-panel.cdm-light .cdm-quality-select:hover { border-color: rgba(99,102,241,0.45); }
    #cdm-control-panel.cdm-light #cdm-progress-bar-track { background: rgba(99,102,241,0.12); }
    #cdm-control-panel.cdm-light #cdm-progress-label     { color: #475569; }
    #cdm-control-panel.cdm-light #cdm-close-btn {
      background: rgba(239,68,68,0.10);
      border: 1px solid rgba(239,68,68,0.22);
      color: #dc2626;
    }
    #cdm-control-panel.cdm-light #cdm-close-btn:hover {
      background: rgba(239,68,68,0.20);
      color: #b91c1c;
    }
    /* Drag cursor anywhere on the panel except interactive elements */
    #cdm-control-panel {
      cursor: grab;
    }
    #cdm-control-panel button,
    #cdm-control-panel select,
    #cdm-control-panel input,
    #cdm-control-panel label,
    #cdm-control-panel a,
    #cdm-resize-handle {
      cursor: auto;
    }
    #cdm-control-panel button { cursor: pointer; }
    #cdm-control-panel select { cursor: pointer; }
    #cdm-control-panel input[type="checkbox"] { cursor: pointer; }
    /* Resize handle — bottom-right corner */
    #cdm-resize-handle {
      position: absolute;
      bottom: 0; right: 0;
      width: 32px; height: 32px;
      cursor: nwse-resize;
      z-index: 10;
      display: flex; align-items: flex-end; justify-content: flex-end;
      padding: 6px;
      border-bottom-right-radius: 20px;
      background: linear-gradient(135deg, transparent 40%, rgba(99,102,241,0.18) 100%);
      transition: background 0.2s;
    }
    #cdm-resize-handle::before {
      content: '';
      position: absolute;
      bottom: 0; right: 0;
      width: 0; height: 0;
      border-style: solid;
      border-width: 0 0 12px 12px;
      border-color: transparent transparent rgba(99,102,241,0.5) transparent;
      border-bottom-right-radius: 20px;
      pointer-events: none;
      transition: border-color 0.2s;
    }
    #cdm-resize-handle svg {
      opacity: 0.55;
      transition: opacity 0.15s, transform 0.15s;
      filter: drop-shadow(0 0 3px rgba(99,102,241,0.6));
    }
    #cdm-resize-handle:hover {
      background: linear-gradient(135deg, transparent 30%, rgba(99,102,241,0.32) 100%);
    }
    #cdm-resize-handle:hover::before {
      border-color: transparent transparent rgba(139,92,246,0.85) transparent;
    }
    #cdm-resize-handle:hover svg {
      opacity: 1;
      transform: scale(1.2);
    }
    /* During drag/resize — disable pointer events inside the page */
    body.cdm-dragging * { pointer-events: none !important; }
    body.cdm-dragging #cdm-control-panel { pointer-events: all !important; cursor: grabbing !important; }
    body.cdm-resizing { cursor: nwse-resize !important; }
    body.cdm-resizing * { pointer-events: none !important; }
    body.cdm-resizing #cdm-control-panel { pointer-events: all !important; }

    /* ── Panel top row ─────────────────────────── */
    #cdm-control-panel .cdm-panel-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-shrink: 0;
    }
    #cdm-control-panel .cdm-panel-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; font-weight: 700;
      color: #e2e8f0; letter-spacing: -0.2px;
    }
    #cdm-control-panel .cdm-panel-title-icon {
      width: 26px; height: 26px; border-radius: 8px;
      background: linear-gradient(135deg, #0082FB, #6C35DE);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(99,102,241,0.4);
    }
    #cdm-close-btn {
      width: 26px; height: 26px; border-radius: 8px;
      background: rgba(248,113,113,0.15);
      border: 1px solid rgba(248,113,113,0.25);
      color: #fca5a5; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; line-height: 1;
      transition: background 0.15s, color 0.15s, border-color 0.15s; flex-shrink: 0;
    }
    #cdm-close-btn:hover { background: rgba(248,113,113,0.30); color: #fecaca; }

    /* ── Stats row ─────────────────────────────── */
    #cdm-control-panel .cdm-stats {
      display: flex; align-items: center; gap: 8px;
      font-size: 11px;
      flex-wrap: wrap;
    }
    #cdm-control-panel .cdm-stat-chip {
      border-radius: 6px; padding: 2px 8px;
      font-size: 11px; font-weight: 600;
    }

    /* ── Controls row ──────────────────────────── */
    #cdm-control-panel .cdm-controls {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    }
    /* Select / Deselect all button */
    .cdm-btn-secondary {
      border-radius: 10px; padding: 6px 12px;
      font-size: 11px; font-weight: 600;
      cursor: pointer; transition: all 0.15s; white-space: nowrap;
      font-family: inherit;
    }

    /* Quality selects */
    .cdm-quality-group {
      display: flex; align-items: center; gap: 6px;
    }
    .cdm-quality-label {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap;
    }
    .cdm-quality-select {
      appearance: none; -webkit-appearance: none;
      border-radius: 8px; padding: 5px 26px 5px 10px;
      font-size: 11px; font-weight: 600;
      cursor: pointer; font-family: inherit;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2.5'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      transition: border-color 0.15s;
    }
    .cdm-quality-select option { background: #1e293b; color: #e2e8f0; }

    /* Download button */
    #cdm-download-btn {
      margin-left: auto;
      display: flex; align-items: center; gap: 6px;
      background: linear-gradient(135deg, #0082FB, #6C35DE);
      border: none; border-radius: 10px;
      padding: 7px 16px;
      font-size: 12px; font-weight: 700; color: white;
      cursor: pointer; font-family: inherit;
      box-shadow: 0 4px 12px rgba(99,102,241,0.35);
      transition: all 0.2s; white-space: nowrap;
    }
    #cdm-download-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(99,102,241,0.45);
    }
    #cdm-download-btn:active:not(:disabled) { transform: scale(0.97); }
    #cdm-download-btn:disabled {
      opacity: 0.5; cursor: not-allowed; transform: none;
    }

    /* ── Progress bar ──────────────────────────── */
    #cdm-progress-wrap {
      display: none;
      flex-direction: column; gap: 6px;
    }
    #cdm-progress-wrap.cdm-visible { display: flex; }
    #cdm-progress-label {
      font-size: 11px; color: #94a3b8; font-weight: 500;
    }
    #cdm-progress-bar-track {
      width: 100%; height: 4px;
      background: rgba(255,255,255,0.08);
      border-radius: 2px; overflow: hidden;
    }
    #cdm-progress-bar-fill {
      height: 100%; width: 0%;
      background: linear-gradient(90deg, #0082FB, #6C35DE);
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    /* Pause / Stop controls row — visible only during download */
    #cdm-download-controls {
      display: none;
      align-items: center; gap: 8px;
    }
    #cdm-download-controls.cdm-visible { display: flex; }
    /* Pause button — amber */
    #cdm-pause-btn {
      display: flex; align-items: center; gap: 5px;
      background: rgba(245,158,11,0.15);
      border: 1px solid rgba(245,158,11,0.35);
      color: #fbbf24;
      border-radius: 10px; padding: 5px 12px;
      font-size: 11px; font-weight: 700;
      cursor: pointer; font-family: inherit;
      transition: all 0.15s; white-space: nowrap;
    }
    #cdm-pause-btn:hover {
      background: rgba(245,158,11,0.28);
      border-color: rgba(245,158,11,0.55);
      color: #fde68a;
    }
    #cdm-pause-btn.cdm-paused {
      background: rgba(99,102,241,0.18);
      border-color: rgba(99,102,241,0.40);
      color: #a5b4fc;
    }
    #cdm-pause-btn.cdm-paused:hover {
      background: rgba(99,102,241,0.30);
      color: #c7d2fe;
    }
    /* Stop button — red */
    #cdm-stop-btn {
      display: flex; align-items: center; gap: 5px;
      background: rgba(239,68,68,0.12);
      border: 1px solid rgba(239,68,68,0.30);
      color: #f87171;
      border-radius: 10px; padding: 5px 12px;
      font-size: 11px; font-weight: 700;
      cursor: pointer; font-family: inherit;
      transition: all 0.15s; white-space: nowrap;
    }
    #cdm-stop-btn:hover {
      background: rgba(239,68,68,0.25);
      border-color: rgba(239,68,68,0.55);
      color: #fca5a5;
    }
    /* Paused status label */
    #cdm-paused-badge {
      display: none;
      font-size: 10px; font-weight: 700;
      color: #fbbf24;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      animation: cdmPausedPulse 1.2s ease-in-out infinite;
    }
    #cdm-paused-badge.cdm-visible { display: inline; }
    @keyframes cdmPausedPulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.4; }
    }

    /* ── Custom scrollbar (shown when panel is resized smaller) ─── */
    #cdm-control-panel::-webkit-scrollbar {
      width: 5px;
      height: 5px;
    }
    #cdm-control-panel::-webkit-scrollbar-track {
      background: rgba(255,255,255,0.04);
      border-radius: 10px;
    }
    #cdm-control-panel::-webkit-scrollbar-thumb {
      background: rgba(99,102,241,0.45);
      border-radius: 10px;
      transition: background 0.2s;
    }
    #cdm-control-panel::-webkit-scrollbar-thumb:hover {
      background: rgba(99,102,241,0.75);
    }
    #cdm-control-panel::-webkit-scrollbar-corner {
      background: transparent;
    }
    /* Firefox */
    #cdm-control-panel {
      scrollbar-width: thin;
      scrollbar-color: rgba(99,102,241,0.45) rgba(255,255,255,0.04);
    }

    /* ── Spinner for download btn ──────────────── */
    @keyframes cdmSpin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .cdm-spinner {
      width: 12px; height: 12px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: cdmSpin 0.7s linear infinite;
      flex-shrink: 0;
    }
  `,document.head.appendChild(e)}function _n(){if(document.getElementById(ke))return;const e=document.createElement("div");e.id=ke,e.innerHTML=`
    <!-- Top row: title + close -->
    <div class="cdm-panel-top">
      <div class="cdm-panel-title">
        <div class="cdm-panel-title-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
        </div>
        <span>Content Download Manager</span>
      </div>
      <button id="cdm-close-btn" title="Close">✕</button>
    </div>

    <!-- Stats row -->
    <div class="cdm-stats" id="cdm-stats">
      <span class="cdm-stat-chip" id="cdm-total-chip">0 tiles</span>
      <span class="cdm-stat-chip cdm-selected" id="cdm-selected-chip">0 selected</span>
    </div>

    <!-- Controls row -->
    <div class="cdm-controls">
      <button class="cdm-btn-secondary" id="cdm-select-all-btn">Select All</button>
      <button class="cdm-btn-secondary" id="cdm-deselect-all-btn">Deselect All</button>
      <button class="cdm-btn-secondary" id="cdm-select-images-btn">Images Only</button>
      <button class="cdm-btn-secondary" id="cdm-select-videos-btn">Videos Only</button>

      <button id="cdm-download-btn" disabled>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        <span id="cdm-download-label">Download (0)</span>
      </button>
    </div>

    <!-- Progress bar (hidden until download starts) -->
    <div id="cdm-progress-wrap">
      <div style="display:flex;align-items:center;gap:8px;">
        <span id="cdm-progress-label" style="flex:1;">Downloading 0 / 0…</span>
        <span id="cdm-paused-badge">⏸ Paused</span>
      </div>
      <div id="cdm-progress-bar-track"><div id="cdm-progress-bar-fill"></div></div>
      <!-- Pause / Stop controls — shown during active download -->
      <div id="cdm-download-controls">
        <button id="cdm-pause-btn">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          <span id="cdm-pause-label">Pause</span>
        </button>
        <button id="cdm-stop-btn">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          <span>Stop</span>
        </button>
      </div>
    </div>

    <!-- Resize handle — bottom-right corner -->
    <div id="cdm-resize-handle" title="Drag to resize">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round">
        <line x1="13" y1="1" x2="1"  y2="13"/>
        <line x1="13" y1="6" x2="6"  y2="13"/>
        <line x1="13" y1="10" x2="10" y2="13"/>
      </svg>
    </div>
  `,document.body.appendChild(e),Dn(),$n(e),Nn(e)}function Dn(){var e,t,o,n,r,a,i,l;(e=document.getElementById("cdm-close-btn"))==null||e.addEventListener("click",ut),(t=document.getElementById("cdm-select-all-btn"))==null||t.addEventListener("click",()=>{oe().forEach(({tileId:d,tileEl:u})=>{Ne(d,u)}),B()}),(o=document.getElementById("cdm-deselect-all-btn"))==null||o.addEventListener("click",()=>{[...N].forEach(d=>{const u=document.querySelector(`[data-cdm-id="${d}"]`);u&&ze(d,u)}),N.clear(),B()}),(n=document.getElementById("cdm-select-images-btn"))==null||n.addEventListener("click",()=>{oe().forEach(({tileId:d,tileEl:u,isVideo:f})=>{f?ze(d,u):Ne(d,u)}),B()}),(r=document.getElementById("cdm-select-videos-btn"))==null||r.addEventListener("click",()=>{oe().forEach(({tileId:d,tileEl:u,isVideo:f})=>{f?Ne(d,u):ze(d,u)}),B()}),(a=document.getElementById("cdm-download-btn"))==null||a.addEventListener("click",Hn),(i=document.getElementById("cdm-pause-btn"))==null||i.addEventListener("click",no),(l=document.getElementById("cdm-stop-btn"))==null||l.addEventListener("click",jn)}const Vn=["button","select","input","textarea","label","a","#cdm-resize-handle","[data-no-drag]"].join(", ");function $n(e){let t,o,n,r;function a(l){const d=l.clientX-t,u=l.clientY-o;let f=n+d,S=r+u;f=Math.max(0,Math.min(window.innerWidth-e.offsetWidth,f)),S=Math.max(0,Math.min(window.innerHeight-e.offsetHeight,S)),e.style.left=f+"px",e.style.top=S+"px",e.style.bottom="auto",e.style.transform="none"}function i(){e.style.cursor="grab",document.body.classList.remove("cdm-dragging"),document.removeEventListener("mousemove",a),document.removeEventListener("mouseup",i)}e.addEventListener("mousedown",l=>{if(l.target.closest(Vn))return;l.preventDefault();const d=e.getBoundingClientRect();n=d.left,r=d.top,t=l.clientX,o=l.clientY,e.style.left=n+"px",e.style.top=r+"px",e.style.bottom="auto",e.style.transform="none",e.style.cursor="grabbing",document.body.classList.add("cdm-dragging"),document.addEventListener("mousemove",a),document.addEventListener("mouseup",i)})}function Nn(e){const t=e.querySelector("#cdm-resize-handle");if(!t)return;const o=360,n=120;let r,a,i,l,d,u;function f(m){const w=m.clientX-r,x=m.clientY-a,s=Math.max(o,Math.min(window.innerWidth-d,i+w)),L=Math.max(n,Math.min(window.innerHeight-u,l+x));e.style.width=s+"px",e.style.height=L+"px"}function S(){document.body.classList.remove("cdm-resizing"),document.removeEventListener("mousemove",f),document.removeEventListener("mouseup",S)}t.addEventListener("mousedown",m=>{m.preventDefault(),m.stopPropagation();const w=e.getBoundingClientRect();r=m.clientX,a=m.clientY,i=w.width,l=w.height,d=w.left,u=w.top,e.style.left=w.left+"px",e.style.top=w.top+"px",e.style.bottom="auto",e.style.transform="none",e.style.width=w.width+"px",e.style.height=w.height+"px",e.style.overflow="auto",document.body.classList.add("cdm-resizing"),document.addEventListener("mousemove",f),document.addEventListener("mouseup",S)})}function B(){const t=oe().length,o=N.size,n=document.getElementById("cdm-total-chip"),r=document.getElementById("cdm-selected-chip"),a=document.getElementById("cdm-download-btn"),i=document.getElementById("cdm-download-label");n&&(n.textContent=`${t} tile${t!==1?"s":""}`),r&&(r.textContent=`${o} selected`),a&&(a.disabled=o===0||te),i&&(i.textContent=te?"Downloading…":`Download (${o})`)}function oo(e,t){const o=t.querySelector("."+fe);if(o)return o;window.getComputedStyle(t).position==="static"&&(t.style.position="relative"),t.style.isolation="isolate",t.classList.add("cdm-isolated");const r=document.createElement("div");r.className=fe+" cdm-active",r.setAttribute("data-cdm-tile",e);const a=document.createElement("div");a.className="cdm-checkbox-wrap";const i=document.createElement("input");i.type="checkbox",i.className="cdm-checkbox",i.setAttribute("data-tile-cb",e),i.checked=N.has(e),i.addEventListener("change",u=>{u.stopPropagation(),i.checked?Ne(e,t):ze(e,t),B()}),r.addEventListener("click",u=>{u.target!==i&&(i.checked=!i.checked,i.dispatchEvent(new Event("change")))}),a.appendChild(i),r.appendChild(a);const l=to(t),d=document.createElement("div");return d.className="cdm-tile-badge",d.textContent=l?"🎬 VIDEO":"🖼 IMAGE",r.appendChild(d),t.appendChild(r),r}function Ne(e,t){N.add(e);const o=t.querySelector(`[data-tile-cb="${e}"]`);o&&(o.checked=!0);let n=t.querySelector(".cdm-tile-selected-ring");if(!n){n=document.createElement("div"),n.className="cdm-tile-selected-ring";const r=t.querySelector("."+fe);r&&r.appendChild(n)}}function ze(e,t){N.delete(e);const o=t.querySelector(`[data-tile-cb="${e}"]`);o&&(o.checked=!1);const n=t.querySelector(".cdm-tile-selected-ring");n&&n.remove()}function zn(){oe().forEach(({tileId:e,tileEl:t})=>{oo(e,t)}),B()}function Un(){document.querySelectorAll("."+fe).forEach(e=>e.remove()),document.querySelectorAll("[data-cdm-tile-pos]").forEach(e=>{e.style.position="",e.removeAttribute("data-cdm-tile-pos")})}function qn(){return document.querySelector('div[role="main"]')||document.querySelector("main")||document.body}function Gn(){var t;if(ue)return;ue=new MutationObserver(o=>{!K||!o.some(r=>[...r.addedNodes].some(a=>{var i;return!(a.nodeType!==Node.ELEMENT_NODE||(i=a.classList)!=null&&i.contains(fe)||a.id===ke||a.id===ot)}))||(clearTimeout(He),He=setTimeout(()=>{K&&(oe().forEach(({tileId:r,tileEl:a})=>{a.querySelector("."+fe)||oo(r,a)}),B())},200))});const e=qn();ue.observe(e,{childList:!0,subtree:!0}),console.log("[CDM] Observer attached to",e.tagName,((t=e.className)==null?void 0:t.slice(0,60))||"")}function Yn(){clearTimeout(He),He=null,ue&&(ue.disconnect(),ue=null)}async function Fn(e){var t;try{e.dispatchEvent(new MouseEvent("mouseenter",{bubbles:!0})),e.dispatchEvent(new MouseEvent("mouseover",{bubbles:!0})),await Ee(350);let o=e.querySelector('button[aria-label="Download"]');if(o||(o=[...e.querySelectorAll("button")].find(i=>{var l;return(l=i.getAttribute("aria-label"))==null?void 0:l.toLowerCase().includes("download")})),o)return o.click(),await Ee(400),!0;console.warn("[CDM] Download button not found — falling back to src download");const n=e.querySelector('[data-testid="generated-video"]'),r=(n==null?void 0:n.getAttribute("data-video-url"))||((t=e.querySelector("video"))==null?void 0:t.src);if(r){const i=document.createElement("a");return i.href=r,i.download="meta-ai-"+Date.now()+".mp4",i.style.display="none",document.body.appendChild(i),i.click(),document.body.removeChild(i),!0}const a=e.querySelector('img[data-testid="generated-image"]');if(a!=null&&a.src){const i=document.createElement("a");return i.href=a.src,i.download="meta-ai-"+Date.now()+".jpg",i.style.display="none",document.body.appendChild(i),i.click(),document.body.removeChild(i),!0}return console.warn("[CDM] No downloadable media found in tile"),!1}catch(o){return console.error("[CDM] _downloadTileViaUI error:",o),!1}}function no(){V=!V;const e=document.getElementById("cdm-pause-btn"),t=document.getElementById("cdm-pause-label"),o=document.getElementById("cdm-paused-badge");e&&e.classList.toggle("cdm-paused",V),t&&(t.textContent=V?"Resume":"Pause");const n=e==null?void 0:e.querySelector("svg");n&&(n.innerHTML=V?'<polygon points="5,3 19,12 5,21" fill="currentColor"/>':'<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>'),o&&o.classList.toggle("cdm-visible",V);const r=document.getElementById("cdm-progress-label");r&&V?r.style.opacity="0.5":r&&(r.style.opacity="")}function jn(){te&&(J=!0,V&&no())}async function Hn(){if(te||N.size===0)return;te=!0,V=!1,J=!1,he=oe().filter(m=>N.has(m.tileId)).map(m=>({tileId:m.tileId,tileEl:m.tileEl,isVideo:m.isVideo}));const t=he.length;let o=0;const n=document.getElementById("cdm-progress-wrap"),r=document.getElementById("cdm-progress-label"),a=document.getElementById("cdm-progress-bar-fill"),i=document.getElementById("cdm-download-btn"),l=document.getElementById("cdm-download-controls"),d=document.getElementById("cdm-pause-btn"),u=document.getElementById("cdm-pause-label");n&&n.classList.add("cdm-visible"),r&&(r.textContent=`Downloading 0 / ${t}…`),a&&(a.style.width="0%"),l&&l.classList.add("cdm-visible"),d&&d.classList.remove("cdm-paused"),u&&(u.textContent="Pause"),i&&(i.disabled=!0,i.innerHTML=`
      <div class="cdm-spinner"></div>
      <span>Downloading…</span>
    `);for(const m of he){if(J){console.log("[CDM] Download stopped by user");break}for(;V&&!J;)await Ee(150);if(J){console.log("[CDM] Download stopped while paused");break}console.log(`[CDM] Downloading tile ${m.tileId} (quality: ${m.quality})`),m.tileEl.scrollIntoView({behavior:"smooth",block:"center",inline:"nearest"}),await Ee(350),await Fn(m.tileEl),o++,r&&(r.textContent=`Downloading ${o} / ${t}…`),a&&(a.style.width=`${Math.round(o/t*100)}%`),await Ee(400)}const f=J;te=!1,V=!1,J=!1,he=[],l&&l.classList.remove("cdm-visible"),d&&d.classList.remove("cdm-paused"),u&&(u.textContent="Pause");const S=document.getElementById("cdm-paused-badge");S&&S.classList.remove("cdm-visible"),r&&(r.style.opacity=""),f?(r&&(r.textContent=`⛔ Stopped after ${o} / ${t}`),a&&(a.style.width=`${Math.round(o/t*100)}%`)):(r&&(r.textContent=`✅ Downloaded ${o} / ${t} complete`),a&&(a.style.width="100%")),i&&(i.innerHTML=`
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
      </svg>
      <span id="cdm-download-label">Download (${N.size})</span>
    `,i.disabled=N.size===0),console.log(`[CDM] Download run complete: ${o}/${t} (stopped=${f})`),setTimeout(()=>{n&&n.classList.remove("cdm-visible")},3e3)}function nt(e){const t=document.getElementById(ke);t&&(t.classList.toggle("cdm-dark",!!e),t.classList.toggle("cdm-light",!e))}function Bn(){try{chrome.storage.local.get(["darkMode"],e=>{nt(e.darkMode!==!1)})}catch{nt(!0)}}function Kn(){if(!me){me=(e,t)=>{t!=="local"||!("darkMode"in e)||nt(e.darkMode.newValue!==!1)};try{chrome.storage.onChanged.addListener(me)}catch{}}}function Qn(){if(me){try{chrome.storage.onChanged.removeListener(me)}catch{}me=null}}function ro(){K||(K=!0,console.log("[CDM] Activating Content Download Manager"),On(),_n(),Bn(),Kn(),zn(),Gn(),B())}function ut(){if(!K)return;K=!1,console.log("[CDM] Deactivating Content Download Manager"),Yn(),Qn(),Un();const e=document.getElementById(ke);e&&e.remove(),N.clear(),te=!1,he=[]}function Wn(){K?ut():ro()}function Xn(){return K}console.log("✅ ContentDownloadManager module loaded");const Zn=Object.freeze(Object.defineProperty({__proto__:null,activate:ro,deactivate:ut,isActive:Xn,toggle:Wn},Symbol.toStringTag,{value:"Module"}));Ao(Me);Co();Lo();Vo(Me);Nt({getState:Me,setState:ee,getSelectors:()=>Ct,eventBus:ve,stateManager:Ke});rn({getState:Me,setState:ee,eventBus:ve,monitoring:Ft,stateManager:Ke});ln({stateManager:Ke,eventBus:ve,monitoring:Ft});pn(Ke,ve);xt(ve,Zn);console.log("✅ Flow Automation bootstrap complete — all modules wired");console.log("📦 Layers: core | interactions (+ imageUploader) | workflow | ui (+ contentDownloadManager)");
