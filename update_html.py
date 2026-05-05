import re

with open("e:\\网页html\\绘图GPT\\gpt-image2\\index.html", "r", encoding="utf-8") as f:
    content = f.read()

# We want to replace everything from <style> to </style> and the body HTML up to <script>
# Let's extract the JS and the head part
script_start = content.find("<script>")
script_end = content.find("</script>") + len("</script>")

js_content = content[script_start:script_end]

new_html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>新起点画室 - AI绘图工具</title>
<style>
/* CYBERPUNK THEME REFACTORED */
:root {
  --bg-deep: #050508;
  --bg-panel: #0a0c14;
  --bg-card: #111424;
  --bg-input: #080a10;
  --border-dim: #1a2240;
  --border-glow: #00f0ff88;
  --neon-cyan: #00e5ff;
  --neon-blue: #2979ff;
  --neon-purple: #b347ea;
  --neon-pink: #ff4081;
  --text-primary: #e0e6ed;
  --text-dim: #7a869e;
  --text-bright: #ffffff;
  --glow-cyan: 0 0 10px rgba(0, 229, 255, 0.4);
  --glow-blue: 0 0 15px rgba(41, 121, 255, 0.5);
  --font-mono: 'Courier New', 'Source Code Pro', monospace;
  --font-sans: 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', system-ui, sans-serif;
  --radius: 8px;
  --transition: 0.3s ease;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg-deep);
  color: var(--text-primary);
  font-family: var(--font-sans);
  min-height: 100vh;
  overflow-x: hidden;
  background-image: 
    radial-gradient(circle at 50% 0%, #111a30 0%, transparent 50%),
    linear-gradient(rgba(0, 229, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 229, 255, 0.03) 1px, transparent 1px);
  background-size: 100% 100%, 30px 30px, 30px 30px;
  display: flex;
  flex-direction: column;
}

/* HEADER */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: rgba(5, 5, 8, 0.8);
  border-bottom: 1px solid var(--border-dim);
  backdrop-filter: blur(10px);
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-logo-icon {
  width: 32px; height: 32px;
  background: var(--neon-blue);
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-weight: bold; color: #fff;
  box-shadow: var(--glow-blue);
}
.header-title-left {
  font-size: 16px; font-weight: 600; color: var(--text-bright);
}

.header-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 24px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 10px var(--neon-cyan), 0 0 20px var(--neon-blue);
  letter-spacing: 2px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
  font-size: 13px;
  color: var(--text-dim);
}
.header-right-item {
  display: flex; align-items: center; gap: 6px; cursor: pointer;
  transition: color var(--transition);
}
.header-right-item:hover { color: var(--neon-cyan); }
.user-profile {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-card); padding: 4px 12px 4px 4px;
  border-radius: 20px; border: 1px solid var(--border-dim);
}
.user-avatar {
  width: 24px; height: 24px; border-radius: 50%; background: #ccc;
}

/* MAIN CONTAINER */
.main-container {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr 320px;
  gap: 20px;
  padding: 20px;
  max-width: 1800px;
  margin: 0 auto;
  width: 100%;
}

.panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-dim);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* Scrollbar */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-dim); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: var(--neon-blue); }

/* LEFT COLUMN */
.left-col {
  gap: 20px;
  display: flex;
  flex-direction: column;
}
.left-section {
  padding: 0 16px;
}
.section-header {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 14px; font-weight: 500; color: var(--text-bright);
  margin-bottom: 12px; padding-top: 16px;
}
.section-header-sub {
  font-size: 12px; color: var(--text-dim);
}

/* Layout Cards (Radio alternative) */
.layout-cards {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
}
.layout-card {
  background: var(--bg-card); border: 1px solid var(--border-dim);
  border-radius: var(--radius); padding: 12px 0;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  cursor: pointer; transition: var(--transition);
  color: var(--text-dim);
}
.layout-card:hover { border-color: var(--neon-cyan); color: var(--text-bright); }
.layout-card.active {
  background: rgba(41, 121, 255, 0.1);
  border-color: var(--neon-blue);
  color: var(--neon-cyan);
  box-shadow: inset 0 0 10px rgba(41, 121, 255, 0.2);
}
.layout-icon {
  width: 24px; height: 24px; border: 2px solid currentColor; border-radius: 2px;
}
.layout-icon.grid-9 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px; border:none; }
.layout-icon.grid-9 span { border: 2px solid currentColor; border-radius: 1px; }
.layout-icon.grid-25 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; border:none; }
.layout-icon.grid-25 span { border: 2px solid currentColor; border-radius: 1px; }

/* Prompt Textarea */
.prompt-area {
  position: relative;
}
.prompt-textarea {
  width: 100%; height: 120px; background: var(--bg-input);
  border: 1px solid var(--border-dim); border-radius: var(--radius);
  padding: 12px; color: var(--text-primary); font-size: 13px;
  resize: none; outline: none; font-family: var(--font-sans);
  transition: var(--transition);
}
.prompt-textarea:focus { border-color: var(--neon-blue); box-shadow: 0 0 5px rgba(41,121,255,0.3); }

/* Upload Zone */
.upload-zone {
  border: 1px dashed var(--border-dim);
  border-radius: var(--radius);
  padding: 20px; text-align: center; cursor: pointer;
  background: var(--bg-input); transition: var(--transition);
  display: flex; align-items: center; justify-content: center; gap: 12px;
}
.upload-zone:hover { border-color: var(--neon-cyan); background: rgba(0,229,255,0.05); }
.upload-zone.has-image { border-style: solid; border-color: var(--neon-blue); padding: 5px; }
.upload-icon-plus { font-size: 24px; color: var(--text-dim); font-weight: 300; }
.upload-text-wrapper { text-align: left; }
.upload-title { font-size: 13px; color: var(--text-bright); }
.upload-subtitle { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
.upload-preview { max-width: 100%; max-height: 80px; border-radius: 4px; object-fit: contain; }

/* Ratio Selector */
.ratio-selector {
  display: flex; gap: 8px; justify-content: space-between;
}
.ratio-card {
  flex: 1; background: var(--bg-card); border: 1px solid var(--border-dim);
  border-radius: 6px; padding: 10px 0;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  cursor: pointer; transition: var(--transition); color: var(--text-dim);
}
.ratio-card:hover { border-color: var(--neon-cyan); color: var(--text-bright); }
.ratio-card.active {
  border-color: var(--neon-blue); color: var(--neon-cyan);
  background: rgba(41, 121, 255, 0.1);
}
.ratio-rect { border: 2px solid currentColor; border-radius: 2px; }

/* Generate Button */
.generate-btn-wrapper {
  padding: 20px 16px; margin-top: auto;
}
.btn-generate {
  width: 100%; padding: 14px; border-radius: 8px; border: none;
  background: linear-gradient(90deg, #448aff, #b347ea);
  color: white; font-size: 16px; font-weight: bold; cursor: pointer;
  box-shadow: 0 4px 15px rgba(179, 71, 234, 0.4);
  transition: var(--transition);
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.btn-generate:hover {
  box-shadow: 0 6px 20px rgba(179, 71, 234, 0.6); transform: translateY(-1px);
}
.btn-generate:disabled {
  opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none;
}

/* CENTER COLUMN */
.center-col {
  border: 1px solid var(--border-dim);
  border-radius: 12px;
  background: var(--bg-panel);
  display: flex; flex-direction: column;
  position: relative;
}
.center-header {
  padding: 16px 20px; font-size: 15px; font-weight: 600; color: var(--text-bright);
  border-bottom: 1px solid var(--border-dim);
}
.center-display-area {
  flex: 1; margin: 20px;
  border: 1px solid rgba(0, 229, 255, 0.3);
  border-radius: 8px;
  position: relative;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(circle at center, rgba(0, 229, 255, 0.05) 0%, transparent 70%);
  overflow: hidden;
}
/* Cyber Frame Accents */
.center-display-area::before, .center-display-area::after {
  content: ''; position: absolute; width: 20px; height: 20px;
  border: 2px solid var(--neon-cyan); pointer-events: none;
}
.center-display-area::before { top: -1px; left: -1px; border-right: none; border-bottom: none; }
.center-display-area::after { bottom: -1px; right: -1px; border-left: none; border-top: none; }
.frame-tr { position: absolute; top: -1px; right: -1px; width: 20px; height: 20px; border: 2px solid var(--neon-cyan); border-left: none; border-bottom: none; }
.frame-bl { position: absolute; bottom: -1px; left: -1px; width: 20px; height: 20px; border: 2px solid var(--neon-cyan); border-right: none; border-top: none; }

.ai-logo-center {
  width: 80px; height: 80px; border-radius: 50%;
  border: 2px solid var(--neon-blue);
  display: flex; align-items: center; justify-content: center;
  font-size: 32px; font-weight: bold; color: var(--neon-cyan);
  box-shadow: 0 0 30px rgba(0, 229, 255, 0.3), inset 0 0 20px rgba(0, 229, 255, 0.2);
  margin-bottom: 24px; position: relative;
}
.ai-logo-center::after {
  content: ''; position: absolute; bottom: -20px; width: 120px; height: 10px;
  background: radial-gradient(ellipse at center, rgba(0,229,255,0.5) 0%, transparent 70%);
  border-radius: 50%;
}
.center-empty-text {
  text-align: center; color: var(--text-dim); font-size: 13px; line-height: 1.6;
}
.center-footer {
  text-align: center; padding: 12px; font-size: 12px; color: var(--text-dim);
  border-top: 1px solid var(--border-dim);
}

/* Result Image */
#centerImage {
  max-width: 100%; max-height: 100%; object-fit: contain; z-index: 10;
}

/* RIGHT COLUMN */
.right-col {
  display: flex; flex-direction: column; gap: 20px;
}
.scenario-list {
  display: flex; flex-direction: column; gap: 12px; padding: 0 16px 16px;
}
.scenario-card {
  display: flex; align-items: center; padding: 12px;
  background: var(--bg-card); border: 1px solid var(--border-dim);
  border-radius: 8px; cursor: pointer; transition: var(--transition);
}
.scenario-card:hover {
  border-color: var(--neon-purple); transform: translateX(-2px);
}
.scenario-icon {
  width: 32px; height: 32px; background: rgba(179, 71, 234, 0.1);
  border-radius: 6px; display: flex; align-items: center; justify-content: center;
  color: var(--neon-purple); font-size: 18px; margin-right: 12px;
}
.scenario-info { flex: 1; }
.scenario-title { font-size: 14px; font-weight: 600; color: var(--text-bright); margin-bottom: 4px; }
.scenario-desc { font-size: 11px; color: var(--text-dim); }
.scenario-thumb {
  width: 60px; height: 40px; border-radius: 4px; object-fit: cover; opacity: 0.8;
}

.history-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 16px;
}
.history-clear {
  font-size: 12px; color: var(--text-dim); cursor: pointer;
  display: flex; align-items: center; gap: 4px;
}
.history-clear:hover { color: var(--neon-pink); }
.history-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
  padding: 0 16px;
}
.history-item {
  aspect-ratio: 1; background: var(--bg-input); border: 1px solid var(--border-dim);
  border-radius: 6px; overflow: hidden; cursor: pointer; transition: var(--transition);
}
.history-item:hover { border-color: var(--neon-cyan); box-shadow: 0 0 10px rgba(0,229,255,0.2); }
.history-item img { width: 100%; height: 100%; object-fit: cover; }
.btn-view-more {
  margin: 16px; padding: 10px; background: transparent;
  border: 1px solid var(--border-dim); border-radius: 6px;
  color: var(--text-dim); font-size: 12px; cursor: pointer; transition: var(--transition);
  text-align: center;
}
.btn-view-more:hover { border-color: var(--neon-blue); color: var(--neon-cyan); }

/* Utility */
.hidden { display: none !important; }

/* Admin Overlay */
.admin-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.8); backdrop-filter: blur(5px);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
}
.admin-panel {
  background: var(--bg-panel); border: 1px solid var(--neon-blue);
  border-radius: 12px; padding: 30px; width: 400px; max-width: 90%;
  box-shadow: var(--glow-blue);
}
.form-input {
  width: 100%; background: var(--bg-input); border: 1px solid var(--border-dim);
  padding: 10px; border-radius: 6px; color: #fff; margin-bottom: 12px;
}
.btn { padding: 10px 20px; border-radius: 6px; border: none; cursor: pointer; color: #fff; }
.btn-primary { background: var(--neon-blue); }
</style>
</head>
<body>

<!-- HEADER -->
<header class="header">
  <div class="header-left">
    <div class="header-logo-icon">AI</div>
    <div class="header-title-left">AI绘图工具</div>
  </div>
  <div class="header-center">新起点画室</div>
  <div class="header-right">
    <div class="header-right-item"><span>💎</span> 会员中心</div>
    <div class="header-right-item"><span>❓</span> 使用教程</div>
    <div class="header-right-item"><span>🔔</span></div>
    <div class="user-profile">
      <div class="user-avatar"></div>
      <span>新起点用户</span>
      <span>▼</span>
    </div>
  </div>
</header>

<!-- MAIN CONTAINER -->
<div class="main-container">
  
  <!-- LEFT COLUMN -->
  <div class="panel left-col">
    <!-- Layout -->
    <div class="left-section">
      <div class="section-header">
        <span>画面布局</span>
        <span>^</span>
      </div>
      <div class="layout-cards" id="modeSelector">
        <div class="layout-card active" data-mode="single" onclick="switchModeUI('single')">
          <div class="layout-icon"></div>
          <span style="font-size:12px;">单图</span>
        </div>
        <div class="layout-card" data-mode="9grid" onclick="switchModeUI('9grid')">
          <div class="layout-icon grid-9"><span></span><span></span><span></span><span></span></div>
          <span style="font-size:12px;">9宫格</span>
        </div>
        <div class="layout-card" data-mode="25grid" onclick="switchModeUI('25grid')">
          <div class="layout-icon grid-25"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
          <span style="font-size:12px;">25宫格</span>
        </div>
      </div>
    </div>

    <!-- Prompt -->
    <div class="left-section">
      <div class="section-header">
        <span>提示词 ⓘ</span>
        <span class="section-header-sub"><span id="promptCount">0</span>/1000</span>
      </div>
      <div class="prompt-area">
        <textarea class="prompt-textarea" id="mainPrompt" placeholder="请输入描述词，支持中英文，例如：&#10;未来城市，赛博朋克风格，夜晚，霓虹灯，&#10;高楼大厦，飞行汽车，超清画质..." oninput="document.getElementById('promptCount').textContent=this.value.length"></textarea>
      </div>
    </div>

    <!-- Upload -->
    <div class="left-section">
      <div class="section-header">
        <span>上传参考图 (可选)</span>
        <span>^</span>
      </div>
      <div class="upload-zone" id="uploadZone" onclick="document.getElementById('refImageInput').click()">
        <div class="upload-icon-plus" id="uploadIconPlus">+</div>
        <div class="upload-text-wrapper" id="uploadTextWrapper">
          <div class="upload-title">点击上传图片</div>
          <div class="upload-subtitle">支持 JPG / PNG 格式，≤ 10MB</div>
        </div>
        <img class="upload-preview hidden" id="uploadPreview">
        <button class="hidden" id="uploadRemove" onclick="event.stopPropagation(); removeRefImage()" style="position:absolute;top:10px;right:10px;background:#ff4081;color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;">✕</button>
      </div>
      <input type="file" id="refImageInput" accept="image/*" class="hidden" onchange="handleRefImage(this)">
    </div>

    <!-- Ratio -->
    <div class="left-section">
      <div class="section-header">
        <span>选择比例</span>
        <span>^</span>
      </div>
      <div class="ratio-selector" id="ratioSelector">
        <div class="ratio-card active" data-ratio="1:1" onclick="selectRatioUI('1:1', this)">
          <div class="ratio-rect" style="width:16px;height:16px;"></div>
          <span style="font-size:10px;">1:1<br>正方形</span>
        </div>
        <div class="ratio-card" data-ratio="16:9" onclick="selectRatioUI('16:9', this)">
          <div class="ratio-rect" style="width:20px;height:12px;"></div>
          <span style="font-size:10px;">16:9<br>横图</span>
        </div>
        <div class="ratio-card" data-ratio="9:16" onclick="selectRatioUI('9:16', this)">
          <div class="ratio-rect" style="width:12px;height:20px;"></div>
          <span style="font-size:10px;">9:16<br>竖图</span>
        </div>
        <div class="ratio-card" data-ratio="3:4" onclick="selectRatioUI('3:4', this)">
          <div class="ratio-rect" style="width:14px;height:18px;"></div>
          <span style="font-size:10px;">3:4<br>竖图</span>
        </div>
        <div class="ratio-card" data-ratio="4:3" onclick="selectRatioUI('4:3', this)">
          <div class="ratio-rect" style="width:18px;height:14px;"></div>
          <span style="font-size:10px;">4:3<br>横图</span>
        </div>
      </div>
    </div>

    <!-- Hidden legacy inputs for compatibility -->
    <div class="hidden">
        <input type="radio" name="mode" id="mode-single" value="single" checked>
        <input type="radio" name="mode" id="mode-9grid" value="9grid">
        <input type="radio" name="mode" id="mode-25grid" value="25grid">
        <div id="gridHint"><span id="gridHintText"></span></div>
        <div id="qualitySelector"><button class="active" data-quality="1k">1K</button></div>
        <span id="statusDot"></span><span id="statusText"></span>
        <div id="apiWarning"></div><div id="apiInfo"></div><div id="corsNote"></div><div id="proxyOk"></div>
    </div>

    <div class="generate-btn-wrapper">
      <button class="btn-generate" id="generateBtn" onclick="generateImages()">
        ✨ 生成图片
      </button>
    </div>
  </div>

  <!-- CENTER COLUMN -->
  <div class="center-col">
    <div class="center-header">图片生成区</div>
    <div class="center-display-area" id="centerDisplay">
      <div class="frame-tr"></div>
      <div class="frame-bl"></div>
      
      <div id="centerEmpty">
        <div class="ai-logo-center">AI</div>
        <div class="center-empty-text">
          输入提示词，选择参数，点击“生成图片”<br>
          AI 将为你创作精美的图像
        </div>
      </div>
      <img id="centerImage" class="hidden" alt="预览">
      <span id="centerIndex" class="hidden" style="position:absolute;top:10px;right:10px;color:var(--neon-cyan);background:rgba(0,0,0,0.5);padding:2px 8px;border-radius:4px;font-size:12px;"></span>
    </div>
    <div class="center-footer">
      内容由AI生成，仅供参考
    </div>
  </div>

  <!-- RIGHT COLUMN -->
  <div class="panel right-col">
    <!-- Scenarios -->
    <div class="section-header" style="padding: 16px 16px 0;">应用场景</div>
    <div class="scenario-list">
      <div class="scenario-card" onclick="applyTemplate('自由创作，激发灵感', '壮丽自然风光，黄金时刻光线，8k超清，照片级真实渲染')">
        <div class="scenario-icon">🎨</div>
        <div class="scenario-info">
          <div class="scenario-title">绘图</div>
          <div class="scenario-desc">自由创作，激发灵感</div>
        </div>
        <div class="scenario-thumb" style="background:linear-gradient(45deg, #2979ff, #00e5ff)"></div>
      </div>
      <div class="scenario-card" onclick="applyTemplate('创意设计，视觉冲击', '电影级海报设计，赛博朋克风格，强对比度，大标题留白')">
        <div class="scenario-icon">📱</div>
        <div class="scenario-info">
          <div class="scenario-title">海报</div>
          <div class="scenario-desc">创意设计，视觉冲击</div>
        </div>
        <div class="scenario-thumb" style="background:linear-gradient(45deg, #b347ea, #ff4081)"></div>
      </div>
      <div class="scenario-card" onclick="applyTemplate('突出卖点，提升转化', '产品摄影，纯白背景，影棚布光，商业级质感，极简主义')">
        <div class="scenario-icon">📦</div>
        <div class="scenario-info">
          <div class="scenario-title">产品详情页</div>
          <div class="scenario-desc">突出卖点，提升转化</div>
        </div>
        <div class="scenario-thumb" style="background:linear-gradient(45deg, #4caf50, #00e676)"></div>
      </div>
      <div class="scenario-card" onclick="applyTemplate('包装设计，吸引眼球', '高端产品包装盒设计，3D渲染，光影质感，简约大气')">
        <div class="scenario-icon">🎁</div>
        <div class="scenario-info">
          <div class="scenario-title">产品包装</div>
          <div class="scenario-desc">包装设计，吸引眼球</div>
        </div>
        <div class="scenario-thumb" style="background:linear-gradient(45deg, #ff9800, #ffea00)"></div>
      </div>
      <div class="scenario-card" onclick="applyTemplate('分镜设计，故事可视化', '日系动漫黑白漫画分镜，多角度特写，网点纸效果，动态线条')">
        <div class="scenario-icon">🖼️</div>
        <div class="scenario-info">
          <div class="scenario-title">漫剧分镜</div>
          <div class="scenario-desc">分镜设计，故事可视化</div>
        </div>
        <div class="scenario-thumb" style="background:linear-gradient(45deg, #9e9e9e, #e0e0e0)"></div>
      </div>
    </div>

    <!-- History -->
    <div class="history-header">
      <span style="font-size:14px;font-weight:500;">历史记录</span>
      <div class="history-clear" onclick="clearHistory()">🗑 清空记录</div>
    </div>
    <div class="history-grid" id="historyGrid">
      <!-- Injected by JS -->
    </div>
    <button class="btn-view-more">查看更多 ∨</button>
  </div>
  
</div>

<!-- ADMIN OVERLAY -->
<div class="admin-overlay hidden" id="adminOverlay">
  <div class="admin-panel" id="adminPanel">
    <div style="display:flex;justify-content:space-between;margin-bottom:20px;">
      <h3 style="color:var(--neon-blue);">管理控制台</h3>
      <button onclick="closeAdmin()" style="background:none;border:none;color:#fff;cursor:pointer;">✕</button>
    </div>
    <div id="adminPasswordGate">
      <input type="password" id="adminPasswordInput" class="form-input" placeholder="管理员密码">
      <button class="btn btn-primary" style="width:100%;" onclick="adminLogin()">验证</button>
      <div id="adminLoginError" style="color:#ff4081;font-size:12px;margin-top:10px;display:none;">密码错误</div>
    </div>
    <div id="adminSettings" class="hidden">
      <label style="font-size:12px;color:var(--text-dim);">API接口地址</label>
      <input type="text" id="apiEndpoint" class="form-input">
      <label style="font-size:12px;color:var(--text-dim);">API密钥</label>
      <input type="password" id="apiKeyInput" class="form-input">
      <label style="font-size:12px;color:var(--text-dim);">模型</label>
      <input type="text" id="modelSelect" class="form-input" value="gpt-image-2">
      <div style="display:none;"><input type="checkbox" id="apiEnabledToggle" checked></div>
      <button class="btn btn-primary" style="width:100%;margin-top:10px;" onclick="saveAdminSettings()">保存设置</button>
    </div>
  </div>
</div>

<!-- LOADING -->
<div class="admin-overlay hidden" id="loadingOverlay" style="flex-direction:column;">
  <div style="width:50px;height:50px;border:3px solid var(--border-dim);border-top-color:var(--neon-cyan);border-radius:50%;animation:spin 1s linear infinite;"></div>
  <div style="color:var(--neon-cyan);margin-top:20px;font-weight:bold;">渲染中...</div>
  <div id="loadingProgress" style="color:#fff;font-size:12px;margin-top:10px;"></div>
</div>
<style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>

<!-- TOAST -->
<div id="toastContainer" style="position:fixed;bottom:20px;right:20px;z-index:9999;"></div>

"""

# Append the original JS to the new HTML
new_content = new_html + js_content + "\n</body>\n</html>"

with open("e:\\网页html\\绘图GPT\\gpt-image2\\index.html", "w", encoding="utf-8") as f:
    f.write(new_content)

print("Done writing to index.html")
