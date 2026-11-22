/* ---------------- DOM scaffold ---------------- */
function injectSliderStyles(){
  if(document.getElementById('mobile-engine-slider-styles')) return;
  const style = document.createElement('style');
  style.id = 'mobile-engine-slider-styles';
  style.textContent = `
    #camControl {
      position: absolute;
      right: 26px;
      top: 50%;
      transform: translateY(-50%);
      background: var(--card, #F4F2EA);
      border: 1px solid #cfccbc;
      padding: 12px 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      user-select: none;
      z-index: 10;
    }
    #camControl .cam-title {
      font-size: 9.5px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--label-ink, #55534A);
      font-weight: 600;
      text-align: center;
      line-height: 1.2;
    }
    #camControl .cam-bound {
      font-size: 9px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--label-ink, #55534A);
      opacity: 0.75;
    }
    #camSlider {
      writing-mode: vertical-lr;
      direction: rtl;
      width: 18px;
      height: 170px;
      margin: 2px 0;
      cursor: ns-resize;
      accent-color: var(--ink, #17181A);
    }
    #camValue {
      font-size: 11px;
      font-weight: 600;
      color: var(--ink, #17181A);
      font-variant-numeric: tabular-nums;
      min-width: 36px;
      text-align: center;
    }
    
    #sheet {
      max-width: 340px;
      z-index: 10;
    }
    #sheet .verify-section {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #cfccbc;
    }
    #sheet .verify-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: 700;
      color: var(--ink, #17181A);
      margin: 0 0 6px;
    }
    #sheet .verify-badge {
      font-size: 9.5px;
      padding: 1px 6px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #fff;
      border-radius: 2px;
    }
    #sheet .verify-badge.pass { background: #1f7a3f; }
    #sheet .verify-badge.warn { background: #b87d14; }
    #sheet .verify-badge.fail { background: #c8341f; }
    #sheet .verify-pane {
      max-height: 150px;
      overflow-y: auto;
      overflow-x: hidden;
      border: 1px solid #d8d5c6;
      background: rgba(255, 255, 255, 0.45);
      padding: 6px 8px;
      font-size: 10px;
      line-height: 1.38;
    }
    #sheet .verify-item {
      padding: 4px 0 4px 7px;
      margin-bottom: 5px;
      border-left: 3px solid #9a9788;
      word-break: break-word;
    }
    #sheet .verify-item:last-child {
      margin-bottom: 0;
    }
    #sheet .verify-item.ERROR {
      border-left-color: var(--red, #C8341F);
    }
    #sheet .verify-item.WARN {
      border-left-color: #b87d14;
    }
    #sheet .verify-item-head {
      font-weight: 700;
      color: var(--ink, #17181A);
      margin-bottom: 1px;
    }
    #sheet .verify-item.ERROR .verify-item-head {
      color: var(--red, #C8341F);
    }
    #sheet .verify-item.WARN .verify-item-head {
      color: #8f5f0a;
    }
    #sheet .verify-ok {
      color: #1f7a3f;
      font-weight: 600;
    }
    
    
  `;
  document.head.appendChild(style);
}

function buildDOM(spec){
  injectSliderStyles();

  const eyebrow = document.createElement('div');
  eyebrow.className = 'eyebrow';
  eyebrow.innerHTML = `MOBILE STUDIO<span>a simulator for Calder-style hanging mobiles</span>`;
  document.body.appendChild(eyebrow);

  const controls = document.createElement('div');
  controls.id = 'controls';
  controls.innerHTML = `<button class="btn" id="btnPuff">Puff of Air</button><button class="btn" id="btnReset">Reset</button>`;
  document.body.appendChild(controls);

  const camControl = document.createElement('div');
  camControl.id = 'camControl';
  camControl.title = 'Adjust camera height relative to the mobile (double-click to reset)';
  const initDeg = Math.round(camElev * 180 / Math.PI);
  camControl.innerHTML = `
    <div class="cam-title">Camera<br>Height</div>
    <div class="cam-bound">High</div>
    <input type="range" id="camSlider" min="-60" max="60" step="1" value="${initDeg}" aria-label="Camera height">
    <div class="cam-bound">Low</div>
    <div id="camValue">${initDeg > 0 ? '+' + initDeg : initDeg}&deg;</div>
  `;
  document.body.appendChild(camControl);

  const svg = el('svg', {id:'stage', viewBox:'0 0 1000 700', preserveAspectRatio:'xMidYMid meet'});
  document.body.appendChild(svg);

  const placard = document.createElement('div');
  placard.id = 'placard';
  placard.innerHTML = `<p class="title" id="placardTitle"></p><p class="meta" id="placardMeta"></p>`;
  document.body.appendChild(placard);

  const hint = document.createElement('div');
  hint.id = 'hint';
  hint.innerHTML = `Click and drag any piece<br>to give it a spin`;
  document.body.appendChild(hint);

  return svg;
}

