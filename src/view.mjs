export function mountRadar(snapshot, initialPreferences, api) {
  const root=document.getElementById('radar-float-v2');
  const app=root.querySelector('.rf-app');
  let backendStatus=null; let hostTheme=api.hostTheme();
  let models=snapshot.models;
  const efforts=['ULTRA','MAX','XHIGH','HIGH','MEDIUM','LOW'];
  const metricInfo={score:{index:0,label:'智商',unit:'分',inverse:false},time:{index:2,label:'耗时',unit:'min',inverse:true},cost:{index:1,label:'费用',unit:'$',inverse:true}};
  const rainbowColors=[{name:'赤',hex:'#ff0000'},{name:'橙',hex:'#ff7f00'},{name:'黄',hex:'#ffff00'},{name:'绿',hex:'#00ff00'},{name:'青',hex:'#00ffff'},{name:'蓝',hex:'#0000ff'},{name:'紫',hex:'#8b00ff'}];
  const ids=new Set(models.map(m=>m.id));
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const state={schema:3,mode:'soft',accent:'#000000',appearance:'system',full:false,closed:false,settings:false,settingsTab:'models',selection:'gpt-6.2-sol:5',preset:'score',selected:models.slice(0,3).map(m=>m.id)};
  let status='',refreshing=false;
  const media=window.matchMedia('(prefers-color-scheme: dark)');
  function restore(source) {
    if(!source||![2,3].includes(source.schema))return;
    if(['soft','rainbow','neon'].includes(source.mode))state.mode=source.mode;
    if(/^#[0-9a-f]{6}$/i.test(source.accent||''))state.accent=source.accent.toLowerCase()==='#26744c'?'#000000':source.accent;
    if(['system','light','dark'].includes(source.appearance))state.appearance=source.appearance;
    const selected=Array.isArray(source.selected)?[...new Set(source.selected.filter(id=>ids.has(id)))]:[];
    if(selected.length)state.selected=selected;
    if(['score','cost','time','manual'].includes(source.preset))state.preset=source.preset;
    if(typeof source.selection==='string'&&/^[a-z0-9.-]+:[0-5]$/.test(source.selection)&&ids.has(source.selection.split(':')[0]))state.selection=source.selection;
  }
  restore(initialPreferences);
  function remember() {
    const preferences={schema:3,mode:state.mode,accent:state.accent,appearance:state.appearance,selected:[...state.selected],preset:state.preset,selection:state.selection};
    api.savePreferences(preferences).then(()=>{
      status='偏好已保存';updateStatus();
    }).catch(error=>{status='偏好保存失败：'+error.message;updateStatus();});
  }
  const dark=()=>state.mode==='neon'||state.appearance==='dark'||(state.appearance==='system'&&(hostTheme?hostTheme==='dark':media.matches));
  function hexHsl(hex) {
    const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
    const hi=Math.max(...rgb),lo=Math.min(...rgb),delta=hi-lo;
    let hue=0;
    if(delta){if(hi===rgb[0])hue=((rgb[1]-rgb[2])/delta)%6;else if(hi===rgb[1])hue=(rgb[2]-rgb[0])/delta+2;else hue=(rgb[0]-rgb[1])/delta+4;hue*=60;}
    return {h:(hue+360)%360,s:delta===0?0:delta/(1-Math.abs(hi+lo-1))};
  }
  function hslRgb(h,s,l) {
    const a=s*Math.min(l,1-l);
    const f=n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));};
    return [f(0),f(8),f(4)];
  }
  function luminance(rgb) {
    const linear=rgb.map(v=>{const x=v/255;return x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4;});
    return linear[0]*0.2126+linear[1]*0.7152+linear[2]*0.0722;
  }
  function equalLuminance(hue,saturation,target) {
    let low=0,high=1,rgb;
    for(let i=0;i<20;i++){const middle=(low+high)/2;rgb=hslRgb(hue,saturation,middle);if(luminance(rgb)<target)low=middle;else high=middle;}
    return hslRgb(hue,saturation,(low+high)/2);
  }
  function level(modelId,key,value) {
    const info=metricInfo[key];
    const model=models.find(candidate=>candidate.id===modelId);
    const values=[...new Set((model?.values||[]).filter(Boolean).map(row=>row[info.index]))].sort((a,b)=>a-b);
    if(values.length<2)return 2;
    const position=values.indexOf(value)/(values.length-1);
    return Number(((info.inverse?1-position:position)*4).toFixed(6));
  }
  function interpolateStops(values,position) {
    const low=Math.floor(position),high=Math.min(values.length-1,low+1);
    return values[low]+(values[high]-values[low])*(position-low);
  }
  function paint(key,rank) {
    const base=hexHsl(state.accent);
    const offset=state.mode==='neon'?18:12;
    const hues={score:base.h,time:(base.h+offset)%360,cost:(base.h-offset+360)%360};
    const shade=4-rank;
    const primarySaturation=base.s<.08?0:Math.min(.55,Math.max(.12,base.s*.85));
    const saturation=base.s<.08?0:state.mode==='soft'?primarySaturation*({score:1,time:.78,cost:.66}[key]):.72;
    const targets=state.mode==='neon'?[.026,.065,.145,.30,.56]:dark()?[.035,.075,.15,.28,.47]:base.s<.08?[.035,.12,.30,.56,.84]:[.12,.23,.39,.59,.81];
    const rainbowHex=rainbowColors[Math.round(shade/4*6)].hex;
    const rgb=state.mode==='rainbow'?[1,3,5].map(i=>parseInt(rainbowHex.slice(i,i+2),16)):equalLuminance(hues[key],saturation,interpolateStops(targets,shade));
    const lum=luminance(rgb);
    const black=(lum+.05)/.05,white=1.05/(lum+.05);
    return {bg:`rgb(${rgb.join(',')})`,fg:black>white?'#000000':'#ffffff',lum,rank};
  }
  function metricStyle(key,value,modelId) {
    const rank=level(modelId,key,value),color=paint(key,rank);
    return `--rf-metric-bg:${color.bg};--rf-metric-fg:${color.fg};--rf-glow:${state.mode==='neon'?rank*2:0}px`;
  }
  function applyAppearance() {
    const base=hexHsl(state.accent),hue=base.h;
    const ink=equalLuminance(hue,base.s<.08?0:.52,dark()?.58:.12);
    const soft=equalLuminance(hue,base.s<.08?0:.20,dark()?.055:.91);
    app.style.colorScheme=dark()?'dark':'light';
    app.style.setProperty('--rf-accent',state.accent);
    app.style.setProperty('--rf-ink',`rgb(${ink.join(',')})`);
    app.style.setProperty('--rf-soft',`rgb(${soft.join(',')})`);
    app.classList.toggle('rf-neon',state.mode==='neon');
    app.classList.toggle('rf-rainbow',state.mode==='rainbow');
    app.querySelectorAll('[data-metric]').forEach(el=>el.style.cssText=metricStyle(el.dataset.metric,Number(el.dataset.value),el.dataset.model));
    app.querySelectorAll('[data-legend-key]').forEach(el=>el.style.background=paint(el.dataset.legendKey,Number(el.dataset.rank)).bg);
  }
  function metric(key,value,modelId) {
    const info=metricInfo[key];
    const number=key==='cost'?'$'+value.toFixed(2):value.toFixed(2)+(key==='time'?'m':'');
    return `<span class="rf-metric ${key==='score'?'rf-score':'rf-secondary'}" data-metric="${key}" data-model="${modelId}" data-value="${value}" data-level="${level(modelId,key,value)}" style="${metricStyle(key,value,modelId)}"><small>${info.label}</small><b>${number}</b></span>`;
  }
  function tile(model,value,index) {
    if(!value)return '<div class="rf-empty" aria-label="该档位暂无数据">—</div>';
    const key=`${model.id}:${index}`;
    const label=`${model.name} ${efforts[index]}，智商 ${value[0].toFixed(2)} 分，耗时 ${value[2].toFixed(2)} 分钟，费用 ${value[1].toFixed(2)} 美元`;
    return `<button type="button" class="rf-tile cursor-interaction" data-tile="${key}" aria-pressed="${key===state.selection}" aria-label="${esc(label)}">${metric('score',value[0],model.id)}${metric('time',value[2],model.id)}${metric('cost',value[1],model.id)}</button>`;
  }
  function modelRow(model) {
    return `<section class="rf-model" data-model-id="${model.id}" aria-label="${esc(model.name)}"><div class="rf-model-head"><span class="rf-model-name">${esc(model.name)}</span><span class="rf-model-mean">各档均分 <b>${model.mean.toFixed(2)}</b></span></div><div class="rf-grid">${model.values.map((value,i)=>`<div><div class="rf-effort">${efforts[i]}</div>${tile(model,value,i)}</div>`).join('')}</div></section>`;
  }
  function miniScale(key) {
    return `<span class="rf-legend-scale">${Array.from({length:6},(_,i)=>`<span data-legend-key="${key}" data-rank="${i/5*4}" style="background:${paint(key,i/5*4).bg}"></span>`).join('')}</span>`;
  }
  function legend() {
    if(state.mode==='rainbow')return `<span>模型内各指标独立排名 · 表现从高到低</span><span class="rf-legend-scale">${rainbowColors.map(color=>`<span style="background:${color.hex}" data-rainbow-color="${color.name}" data-tooltip="${color.name}" aria-label="${color.name}"></span>`).join('')}</span><span>赤橙黄绿青蓝紫</span>`;
    return `<span>模型内各指标独立排名</span><span>淡</span>${miniScale('score')}<span>浓 · 同值同色</span>`;
  }
  const selectedModels=()=>state.selected.map(id=>models.find(m=>m.id===id)).filter(Boolean);
  function modelSettings() {
    const ordered=[...selectedModels(),...models.filter(m=>!state.selected.includes(m.id))];
    return `<div class="rf-preset-row" role="group" aria-label="默认模型倾向">${[['score','高分优先'],['cost','低费用优先'],['time','少耗时优先'],['manual','自选模型']].map(([key,label])=>`<button type="button" class="rf-small-button cursor-interaction" data-preset="${key}" aria-pressed="${state.preset===key}">${label}</button>`).join('')}</div><p class="rf-setting-note">紧凑视图显示勾选的模型；上下按钮调整展示顺序。当前 ${state.selected.length} 个。</p><div class="rf-choice-list">${ordered.map(model=>{const index=state.selected.indexOf(model.id);return `<div class="rf-model-choice"><label><input type="checkbox" data-prefer="${model.id}" ${index>=0?'checked':''}>${esc(model.name)}</label>${index>=0?`<span class="rf-priority"><button type="button" class="rf-icon cursor-interaction" data-move="${model.id}" data-step="-1" aria-label="提升 ${esc(model.name)} 优先级" ${index===0?'disabled':''}>${icon('chevron-up')}</button><button type="button" class="rf-icon cursor-interaction" data-move="${model.id}" data-step="1" aria-label="降低 ${esc(model.name)} 优先级" ${index===state.selected.length-1?'disabled':''}>${icon('chevron-down')}</button></span>`:''}</div>`;}).join('')}</div>`;
  }
  function colorSettings() {
    return `<p class="rf-setting-note">每个模型单独比较：三项指标各自排序，按名次分配固定色阶；相同数值同色，缺失档位不参与。</p><div class="rf-tier-summary">${Object.entries(metricInfo).map(([key,info])=>`<span>${info.label}：${key==='score'?'分数越高，表现越好':'数值越低，表现越好'}${miniScale(key)}</span>`).join('')}</div><p class="rf-setting-note">${state.mode==='rainbow'?'彩虹使用赤、橙、黄、绿、青、蓝、紫七种正色，赤色表示本模型内最佳表现。':'本模型内表现越好，颜色越浓；颜色深浅只用于同一模型内比较。'}</p>`;
  }
  function settingsPanel() {
    return `<section class="rf-settings" aria-label="雷达偏好设置" ${state.settings?'':'hidden'}><div class="rf-settings-tabs" role="tablist" aria-label="雷达设置"><button type="button" class="rf-small-button cursor-interaction" data-setting-tab="models" role="tab" aria-selected="${state.settingsTab==='models'}" aria-controls="rf-model-settings" id="rf-model-tab">默认模型</button><button type="button" class="rf-small-button cursor-interaction" data-setting-tab="colors" role="tab" aria-selected="${state.settingsTab==='colors'}" aria-controls="rf-color-settings" id="rf-color-tab">配色规则</button></div><div id="rf-model-settings" role="tabpanel" aria-labelledby="rf-model-tab" ${state.settingsTab==='models'?'':'hidden'}>${modelSettings()}</div><div id="rf-color-settings" role="tabpanel" aria-labelledby="rf-color-tab" ${state.settingsTab==='colors'?'':'hidden'}>${colorSettings()}</div></section>`;
  }
  function selectionText() {
    const [id,index]=state.selection.split(':');
    const model=models.find(m=>m.id===id),value=model?.values[Number(index)];
    return value?`${icon('crosshair')}<b>${esc(model.name)} · ${efforts[Number(index)]}</b><span>${value[0].toFixed(2)} 分 / ${value[2].toFixed(2)} min / $${value[1].toFixed(2)}</span>`:`${icon('mouse-pointer-2')}点击任一档位查看详情`;
  }
  function render() {
    const shown=state.full?models:selectedModels();
    const swatches=[['#000000','默认黑'],['#396cbb','湖蓝'],['#8b52c1','紫罗兰'],['#c05f30','暖橙']];
    app.innerHTML=`<main class="rf-workspace"><button type="button" class="rf-launcher cursor-interaction" data-action="launch" aria-label="${state.closed?'展开模型雷达':'关闭模型雷达浮窗'}" aria-expanded="${!state.closed}">${icon('radar')}模型雷达</button><section class="rf-panel${state.full?' rf-full':''}" aria-label="模型雷达面板" ${state.closed?'hidden':''}><header class="rf-head"><div class="rf-brand"><span class="rf-mark">${icon('radar')}</span><div><h2>模型雷达</h2><div class="rf-subtitle">${state.full?'完整视图':`紧凑浮窗 · ${shown.length} 个默认模型`}</div></div></div><div class="rf-actions"><button class="rf-icon cursor-interaction" type="button" data-action="refresh" aria-label="立即刷新榜单" ${refreshing?'disabled':''}>${icon('refresh-cw')}</button><button class="rf-icon cursor-interaction" type="button" data-action="appearance" aria-label="切换深浅外观" data-tooltip="${state.mode==='neon'?'霓虹模式使用深色背景':`当前外观：${dark()?'深色':'浅色'}`}">${icon(dark()?'moon':'sun')}</button><button class="rf-icon cursor-interaction" type="button" data-action="settings" aria-label="设置默认模型和配色规则" aria-pressed="${state.settings}">${icon('sliders-horizontal')}</button><button class="rf-icon cursor-interaction" type="button" data-action="size" aria-label="${state.full?'收起为默认模型':'展开所有模型'}">${icon(state.full?'minimize-2':'maximize-2')}</button><button class="rf-icon cursor-interaction" type="button" data-action="close" aria-label="关闭模型雷达">${icon('x')}</button></div></header><div class="rf-quick"><div class="rf-mode-group" role="group" aria-label="配色模式">${[['soft','清新','palette'],['rainbow','彩虹','rainbow'],['neon','霓虹','zap']].map(([key,label,name])=>`<button type="button" class="rf-mode cursor-interaction" data-mode="${key}" aria-pressed="${state.mode===key}">${icon(name)}${label}</button>`).join('')}</div><div class="rf-colors" role="group" aria-label="快捷主色"><span>主色</span>${swatches.map(([color,label])=>`<button class="rf-swatch cursor-interaction" type="button" data-accent="${color}" aria-label="${label}主色" aria-pressed="${state.accent.toLowerCase()===color}" data-tooltip="${label}" style="--rf-swatch:${color}"><span></span></button>`).join('')}<input type="color" class="rf-custom-color cursor-interaction" aria-label="自定义主色" value="${state.accent}"></div></div><div class="rf-meta"><span><strong>${state.mode==='rainbow'?'七正色 · 模型内独立排名':'高分 · 省时 · 低费 = 更浓'}</strong></span><span class="rf-schedule">${icon('clock-3')}30 分钟自动更新</span></div>${settingsPanel()}<div class="rf-body">${shown.map(modelRow).join('')}</div><button type="button" class="rf-expand cursor-interaction" data-action="size">${state.full?`收起为默认的 ${state.selected.length} 个模型`:`查看全部 ${models.length} 个模型`}${icon(state.full?'minimize-2':'maximize-2')}</button><div class="rf-detail" aria-live="polite">${selectionText()}</div><div class="rf-legend">${legend()}</div><footer class="rf-footer"><span>站点数据 ${esc(snapshot.time)}</span><a href="https://codexradar.com/#iq" target="_blank" rel="noopener noreferrer" aria-label="打开 CodexRadar 数据来源">codexradar.com${icon('external-link')}</a></footer></section><div class="rf-idle" ${state.closed?'':'hidden'}><strong>模型雷达已收起</strong><span>点击右上方按钮重新展开</span></div><div class="rf-status" role="status" aria-live="polite">${esc(status)}</div></main>`;
    applyAppearance();updateStatus();
    if(globalThis.lucide)globalThis.lucide.createIcons({attrs:{width:16,height:16}});
  }
  function average(model,index) {const values=model.values.filter(Boolean);return values.reduce((sum,v)=>sum+v[index],0)/values.length;}
  function setPreset(preset) {
    state.preset=preset;
    if(preset==='manual')return;
    const sorted=[...models].sort((a,b)=>preset==='score'?b.mean-a.mean:average(a,preset==='cost'?1:2)-average(b,preset==='cost'?1:2));
    state.selected=sorted.slice(0,3).map(m=>m.id);
  }
  function commit(message='') {status=message;render();remember();}
  app.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.dataset.tile){state.selection=button.dataset.tile;commit();app.querySelector(`[data-tile="${state.selection}"]`)?.focus({preventScroll:true});return;}
    if(button.dataset.mode){state.mode=button.dataset.mode;commit();return;}
    if(button.dataset.accent){state.accent=button.dataset.accent;commit();return;}
    if(button.dataset.settingTab){state.settingsTab=button.dataset.settingTab;render();return;}
    if(button.dataset.preset){setPreset(button.dataset.preset);commit('默认模型偏好已更新');return;}
    if(button.dataset.move){const index=state.selected.indexOf(button.dataset.move),next=index+Number(button.dataset.step);if(index>=0&&next>=0&&next<state.selected.length){[state.selected[index],state.selected[next]]=[state.selected[next],state.selected[index]];state.preset='manual';commit('默认模型顺序已更新');}return;}
    const action=button.dataset.action;
    if(action==='close')state.closed=true;
    if(action==='launch')state.closed=!state.closed;
    if(action==='settings')state.settings=!state.settings;
    if(action==='size'){state.full=!state.full;state.settings=false;}
    if(action==='appearance'){if(state.mode==='neon'){status='霓虹模式固定使用深色背景；清新和彩虹可切换深浅外观。';render();return;}state.appearance=dark()?'light':'dark';}
    if(action==='refresh'){
      refreshing=true;status='正在从来源站更新…';render();
      api.refresh().then(payload=>{refreshing=false;update(payload);status=payload.status.lastError?'更新失败，已保留上次数据':'数据已检查';render();}).catch(error=>{refreshing=false;status='更新失败：'+error.message;render();});return;
    }
    if(action)commit();
  });
  app.addEventListener('change',event=>{
    const input=event.target;
    if(input.matches('[data-prefer]')){
      const id=input.dataset.prefer;
      if(input.checked&&!state.selected.includes(id))state.selected.push(id);
      else if(!input.checked){if(state.selected.length===1){input.checked=true;status='至少保留一个默认模型';app.querySelector('.rf-status').textContent=status;return;}state.selected=state.selected.filter(value=>value!==id);}
      state.preset='manual';commit('默认模型偏好已更新');
    }
    if(input.matches('.rf-custom-color')){state.accent=input.value;commit('主色已更新');}
  });
  app.addEventListener('input',event=>{
    if(event.target.matches('.rf-custom-color')){state.accent=event.target.value;applyAppearance();}
  });
  app.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    if(state.settings){state.settings=false;render();app.querySelector('[data-action="settings"]')?.focus();}
    else if(!state.closed){state.closed=true;render();app.querySelector('[data-action="launch"]')?.focus();}
  });
  media.addEventListener('change',()=>{if(state.appearance==='system'&&state.mode!=='neon')applyAppearance();});

  render();

  function updateStatus() {
    const label=app.querySelector('.rf-schedule');
    if(label&&backendStatus){
      const next=new Date(backendStatus.nextRefreshAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false});
      label.textContent=backendStatus.refreshing?'正在更新…':backendStatus.lastError?'更新失败 · 保留上次数据':'每30分钟更新 · 下次 '+next;
      label.classList.toggle('rf-update-error',!!backendStatus.lastError);
      if(backendStatus.lastError)label.setAttribute('data-tooltip',backendStatus.lastError.message);else label.removeAttribute('data-tooltip');
    }
    const timeNode=app.querySelector('.rf-footer > span');
    if(timeNode&&backendStatus?.checkedAt){
      const checked=new Date(backendStatus.checkedAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false});
      timeNode.textContent='站点数据 '+snapshot.time+' · 已检查 '+checked;
    }
    const statusNode=app.querySelector('.rf-status');if(statusNode)statusNode.textContent=status;
  }
  function update(payload) {
    backendStatus=payload.status;
    if(payload.data&&payload.data.htmlHash!==snapshot.htmlHash){
      snapshot=api.normalize(payload.data);models=snapshot.models;ids.clear();models.forEach(model=>ids.add(model.id));
      state.selected=state.selected.filter(id=>ids.has(id));if(!state.selected.length)state.selected=models.slice(0,3).map(model=>model.id);
      render();
    }else updateStatus();
  }
  app.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');if(!link)return;
    event.preventDefault();api.openLink(link.href).catch(error=>{status='无法打开来源：'+error.message;updateStatus();});
  });
  return {update,setHostTheme(theme){hostTheme=theme;applyAppearance();},getPreferences(){return {schema:3,mode:state.mode,accent:state.accent,appearance:state.appearance,selected:[...state.selected],preset:state.preset,selection:state.selection};}};
}
