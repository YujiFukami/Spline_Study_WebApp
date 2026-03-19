/**
 * ui-controller.js
 * UI制御・イベントハンドラー・入力チェック
 */

// モードごとのデフォルトサンプルデータ
const SAMPLE_DATA = {
  normal: `0,0
1,2
2,1
3,3
4,2.5
5,4`,
  parametric: `0,0
2,3
4,1
3,-2
1,-1
-1,2`
};

class UIController {
  constructor() {
    this.currentResult = null;
    this.currentMode = 'normal';
    // モードごとにユーザーが入力したテキストを保持するキャッシュ
    // null = まだ何も編集していない（サンプルのまま）
    this._savedInput = {
      normal: null,
      parametric: null
    };
    this.initializeEventListeners();
    // 初期表示：通常補間のサンプルデータをセット
    this._setInputForMode('normal');
  }

  initializeEventListeners() {
    // モード切替
    document.getElementById('modeToggle')?.addEventListener('change', (e) => {
      this.currentMode = e.target.value;
      this.updateModeDescription();
    });

    // 実行ボタン
    document.getElementById('executeBtn')?.addEventListener('click', () => this.executeInterpolation());

    // クリアボタン
    document.getElementById('clearBtn')?.addEventListener('click', () => this.clearAll());

    // サンプルボタン
    document.getElementById('sampleBtn')?.addEventListener('click', () => this.addSampleData());

    // コピーボタン
    document.getElementById('copyBtn')?.addEventListener('click', () => this.copyOutput());
  }

  /**
   * 入力データを解析
   */
  parseInputData() {
    const inputText = document.getElementById('pointInput')?.value || '';
    const points = [];
    const errors = [];

    if (!inputText.trim()) {
      errors.push('入力データがありません');
      return { points: [], errors };
    }

    const lines = inputText.split('\n');

    lines.forEach((line, lineNum) => {
      line = line.trim();
      if (!line) return;

      // カンマ区切りまたはタブ区切りで分割
      let parts = [];
      if (line.includes('\t')) {
        parts = line.split('\t');
      } else if (line.includes(',')) {
        parts = line.split(',');
      } else if (line.includes(' ')) {
        parts = line.split(/\s+/);
      } else {
        errors.push(`行 ${lineNum + 1}: 区切り文字が見つかりません`);
        return;
      }

      if (parts.length < 2) {
        errors.push(`行 ${lineNum + 1}: X, Y の2列が必要です`);
        return;
      }

      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]);

      if (isNaN(x) || isNaN(y)) {
        errors.push(`行 ${lineNum + 1}: 数値に変換できません`);
        return;
      }

      points.push({ x, y });
    });

    // 最小点数チェック
    if (points.length < 3) {
      errors.push(`点数が不足しています（${points.length}点。最低3点必要）`);
      return { points: [], errors };
    }

    // 通常補間モードでのX単調増加チェック
    if (this.currentMode === 'normal') {
      for (let i = 1; i < points.length; i++) {
        if (points[i].x <= points[i - 1].x) {
          errors.push(`警告: X が単調増加していません（行 ${i + 1}）。通常補間は Xの単調増加を前提とします。パラメトリック補間への切り替えを検討してください。`);
          break;
        }
      }
    }

    // 重複チェック（通常補間モードのみ）
    if (this.currentMode === 'normal') {
      const xSet = new Set();
      for (let p of points) {
        if (xSet.has(p.x)) {
          errors.push(`警告: 同じ X 値が重複しています: ${p.x}`);
          break;
        }
        xSet.add(p.x);
      }
    }

    return { points, errors };
  }

  /**
   * 補間実行メイン処理
   */
  executeInterpolation() {
    const errorContainer = document.getElementById('errorContainer');
    const divNum = parseInt(document.getElementById('divNum')?.value || '10');

    if (divNum < 1) {
      this.showError('分割数は1以上の整数である必要があります');
      return;
    }

    // 入力データ解析
    const { points, errors } = this.parseInputData();

    // エラー表示
    if (errors.length > 0) {
      this.showError(errors.join('\n'));
      if (points.length === 0) return;
    } else {
      errorContainer.textContent = '';
    }

    try {
      // スプライン補間実行
      let result;
      if (this.currentMode === 'normal') {
        const xArr = points.map(p => p.x);
        const yArr = points.map(p => p.y);
        result = SplineInterpolationEngine.normalSplineInterpolation(xArr, yArr, divNum);
      } else {
        const xArr = points.map(p => p.x);
        const yArr = points.map(p => p.y);
        result = SplineInterpolationEngine.parametricSplineInterpolation(xArr, yArr, divNum, 'uniform');
      }

      this.currentResult = result;

      // 結果表示
      this.displayResults(result);
      this.displayLearningContent(result);
      this.renderChart(result);

    } catch (error) {
      this.showError(`計算エラー: ${error.message}`);
    }
  }

  /**
   * 結果表示
   */
  displayResults(result) {
    const outputContainer = document.getElementById('outputContainer');
    let outputText = '';

    // CSV形式で出力
    for (let point of result.interpolated) {
      outputText += `${point.x.toFixed(6)},${point.y.toFixed(6)}\n`;
    }

    const outputTextarea = document.getElementById('outputPoints');
    if (outputTextarea) {
      outputTextarea.value = outputText.trim();
    }

    // サマリー表示
    const summaryDiv = document.getElementById('resultSummary');
    if (summaryDiv) {
      summaryDiv.innerHTML = `
        <p><strong>補間完了</strong></p>
        <p>元の点数: ${result.originalPoints.length}</p>
        <p>補間後の点数: ${result.interpolated.length}</p>
        <p>モード: ${result.mode === 'normal' ? '通常補間' : 'パラメトリック補間'}</p>
      `;
    }
  }

  /**
   * 学習用表示内容 — 新STEPレイアウト対応版
   * index.html の各 val-step* プレースホルダーに実際の値を注入する
   */
  displayLearningContent(result) {
    const n = result.details.n;

    // ---- 概要エリア：モードノート ----
    const modeNoteEl = document.getElementById('theory-mode-note');
    if (modeNoteEl) {
      if (result.mode === 'normal') {
        modeNoteEl.textContent = '現在のモード: 通常補間（Y = f(X)） — X 座標を独立変数として補間します。';
      } else {
        modeNoteEl.textContent = `現在のモード: パラメトリック補間（X = x(t), Y = y(t)） — 等間隔パラメータ t を使用します。`;
      }
    }

    // ---- STEP 1: 区間幅 Δh の実際の値 ----
    const step1El = document.getElementById('val-step1');
    if (step1El) {
      let html = '<table class="matrix-table" style="width:auto;">';
      html += '<tr><th>区間 k</th>';
      for (let k = 0; k < n; k++) html += `<th>k = ${k}</th>`;
      html += '</tr><tr>';
      if (result.mode === 'normal') {
        html += '<td>Δh<sub>k</sub></td>';
        for (let k = 0; k < n; k++) {
          html += `<td>${this._fmtNum(result.intervals[k])}</td>`;
        }
      } else {
        html += '<td>Δt<sub>k</sub></td>';
        for (let k = 0; k < n; k++) {
          html += `<td>${this._fmtNum(result.intervals[k])}</td>`;
        }
      }
      html += '</tr>';
      // 区間の始点・終点も表示
      if (result.mode === 'normal') {
        html += '<tr><td>x<sub>k</sub></td>';
        for (let k = 0; k < n; k++) html += `<td>${this._fmtNum(result.originalPoints[k].x)}</td>`;
        html += '</tr><tr><td>x<sub>k+1</sub></td>';
        for (let k = 0; k < n; k++) html += `<td>${this._fmtNum(result.originalPoints[k+1].x)}</td>`;
        html += '</tr>';
      } else {
        html += '<tr><td>t<sub>k</sub></td>';
        for (let k = 0; k < n; k++) html += `<td>${this._fmtNum(result.parameters[k])}</td>`;
        html += '</tr><tr><td>t<sub>k+1</sub></td>';
        for (let k = 0; k < n; k++) html += `<td>${this._fmtNum(result.parameters[k+1])}</td>`;
        html += '</tr>';
      }
      html += '</table>';
      step1El.innerHTML = html;
    }

    // ---- STEP 2: 各区間の係数（a_k, b_k, c_k, d_k）----
    const step2El = document.getElementById('val-step2');
    if (step2El) {
      let html = '<table class="matrix-table" style="width:auto;">';
      html += '<tr><th>k</th><th>a<sub>k</sub></th><th>b<sub>k</sub></th><th>c<sub>k</sub></th><th>d<sub>k</sub></th></tr>';
      for (let k = 0; k < n; k++) {
        const a = result.coefficients[3*k][0];
        const b = result.coefficients[3*k+1][0];
        const c = result.coefficients[3*k+2][0];
        const d = result.originalPoints[k].y;
        html += `<tr><td>${k}</td><td>${this._fmtNum(a)}</td><td>${this._fmtNum(b)}</td><td>${this._fmtNum(c)}</td><td>${this._fmtNum(d)}</td></tr>`;
      }
      html += '</table>';
      step2El.innerHTML = html;
    }

    // ---- STEP 3: 行列方程式（一般式＋実際の値）----
    // 一般式：点数に合わせたシンボリック行列
    const matSymEl = document.getElementById('val-matrix-symbolic');
    if (matSymEl) {
      matSymEl.innerHTML = this._renderSymbolicMatrix(n);
    }

    const rhsSymEl = document.getElementById('val-rhs-symbolic');
    if (rhsSymEl) {
      rhsSymEl.innerHTML = this._renderSymbolicRhs(n);
    }

    // 実際の係数行列 [A]
    const matAEl = document.getElementById('val-matrix-A');
    if (matAEl) {
      if (n <= 6) {
        matAEl.innerHTML = this._renderMatrixTable(result.matrix, 'A');
      } else {
        matAEl.innerHTML = `<p style="color:#888; font-style:italic;">区間数 ${n} が大きいため行列表示を省略しています（6区間以下で表示）。</p>`;
      }
    }

    const rhsValEl = document.getElementById('val-rhs-values');
    if (rhsValEl) {
      rhsValEl.innerHTML = this._renderVectorTable(result.vector, 'b');
    }

    // ---- STEP 4: 解ベクトル ----
    const step4El = document.getElementById('val-step4');
    if (step4El) {
      step4El.innerHTML = this._renderCoefficientVector(result.coefficients, n);
    }

    // ---- STEP 5: 確定した各区間のスプライン式 ----
    const step5El = document.getElementById('val-step5');
    if (step5El) {
      let html = '';
      for (let k = 0; k < n; k++) {
        const a = result.coefficients[3*k][0];
        const b = result.coefficients[3*k+1][0];
        const c = result.coefficients[3*k+2][0];

        let rangeLabel, hDef, dVal;
        if (result.mode === 'normal') {
          const x0 = result.originalPoints[k].x;
          const x1 = result.originalPoints[k+1].x;
          dVal = result.originalPoints[k].y;
          rangeLabel = `x ∈ [${this._fmtNum(x0)}, ${this._fmtNum(x1)}]`;
          hDef = `h = (x − ${this._fmtNum(x0)}) / ${this._fmtNum(result.intervals[k])}`;
        } else {
          const t0 = result.parameters[k];
          const t1 = result.parameters[k+1];
          // パラメトリックは x(t), y(t) 両方の係数を持つが、ここでは x(t) 側を表示
          dVal = result.originalPoints[k].x;
          rangeLabel = `t ∈ [${this._fmtNum(t0)}, ${this._fmtNum(t1)}]`;
          hDef = `h = (t − ${this._fmtNum(t0)}) / ${this._fmtNum(result.intervals[k])}`;
        }

        const aSign = b >= 0 ? '+' : '−';
        const bAbs  = Math.abs(b);
        const cSign = c >= 0 ? '+' : '−';
        const cAbs  = Math.abs(c);
        const dSign = dVal >= 0 ? '+' : '−';
        const dAbs  = Math.abs(dVal);

        html += `
          <div style="background:#f9f9f9; padding:14px; border-left:3px solid #0066cc; margin-bottom:14px; border-radius:4px;">
            <p style="font-weight:600; margin-bottom:6px;">区間 k = ${k}　（${rangeLabel}）</p>
            <p style="font-family:'Courier New',monospace; line-height:1.8;">
              S<sub>${k}</sub>(h) = ${this._fmtNum(a)}·h³
                ${aSign} ${this._fmtNum(bAbs)}·h²
                ${cSign} ${this._fmtNum(cAbs)}·h
                ${dSign} ${this._fmtNum(dAbs)}
            </p>
            <p style="font-size:0.88rem; color:#666; margin-top:6px;">※ ${hDef}　（0 ≤ h ≤ 1）</p>
          </div>`;
        if (result.mode === 'parametric') {
          // y(t) 側の係数も表示
          const yCoeff = result.yEngine ? result.yEngine.coefficients : null;
          if (yCoeff) {
            const ay = yCoeff[3*k][0];
            const by = yCoeff[3*k+1][0];
            const cy = yCoeff[3*k+2][0];
            const dy = result.originalPoints[k].y;
            const aySign = by >= 0 ? '+' : '−';
            const byAbs  = Math.abs(by);
            const cySign = cy >= 0 ? '+' : '−';
            const cyAbs  = Math.abs(cy);
            const dySign = dy >= 0 ? '+' : '−';
            const dyAbs  = Math.abs(dy);
            html += `
              <div style="background:#f0f8f0; padding:14px; border-left:3px solid #51cf66; margin-bottom:14px; margin-top:-10px; border-radius:4px;">
                <p style="font-weight:600; margin-bottom:6px; color:#2f7a3a;">y(t) の補間式（同区間）</p>
                <p style="font-family:'Courier New',monospace; line-height:1.8;">
                  y<sub>${k}</sub>(h) = ${this._fmtNum(ay)}·h³
                    ${aySign} ${this._fmtNum(byAbs)}·h²
                    ${cySign} ${this._fmtNum(cyAbs)}·h
                    ${dySign} ${this._fmtNum(dyAbs)}
                </p>
              </div>`;
          }
        }
      }
      step5El.innerHTML = html;
    }

    // MathJax を再レンダリング
    const learningSection = document.getElementById('learningSection');
    if (window.MathJax && learningSection) {
      MathJax.typesetPromise([learningSection]).catch(err => console.log(err));
    }
  }

  /**
   * シンボリック行列（一般式）を HTML テーブルで生成
   * n 区間に合わせた 3n × 3n 行列の構造を記号で示す
   * @private
   */
  _renderSymbolicMatrix(n) {
    const size = 3 * n;
    // 行ラベル
    const rowLabels = [];
    for (let k = 0; k < n; k++)     rowLabels.push(`補間(k=${k})`);
    for (let k = 0; k < n-1; k++)   rowLabels.push(`1次連続(k=${k})`);
    for (let k = 0; k < n-1; k++)   rowLabels.push(`2次連続(k=${k})`);
    rowLabels.push('境界(左端)');
    rowLabels.push('境界(右端)');

    const cellStyle = 'style="padding:3px 5px; font-size:0.75rem; font-family:monospace; min-width:50px; text-align:center;"';
    const hdStyle   = 'style="padding:3px 5px; font-size:0.72rem;"';

    // 列ラベル: a0 b0 c0  a1 b1 c1 ...
    const colLabels = [];
    for (let k = 0; k < n; k++) {
      colLabels.push(`a<sub>${k}</sub>`, `b<sub>${k}</sub>`, `c<sub>${k}</sub>`);
    }

    let html = '<div style="overflow-x:auto;"><table class="matrix-table">';
    html += `<tr><th colspan="${size+1}" style="font-size:0.8rem;">係数行列 [A]（${size}×${size}）— 非ゼロ成分のみ表示</th></tr>`;
    html += `<tr><th ${hdStyle}>条件</th>`;
    for (let j = 0; j < size; j++) html += `<th ${hdStyle}>${colLabels[j]}</th>`;
    html += '</tr>';

    // 各行を生成
    for (let i = 0; i < size; i++) {
      html += `<tr><th ${hdStyle} style="text-align:left;">${rowLabels[i]}</th>`;
      for (let j = 0; j < size; j++) {
        const sym = this._symbolicEntry(i, j, n);
        const bg  = sym !== '0' ? 'background:#e8f4ff;' : '';
        html += `<td ${cellStyle} style="${bg}">${sym}</td>`;
      }
      html += '</tr>';
    }
    html += '</table></div>';
    return html;
  }

  /**
   * 係数行列の (i, j) 成分をシンボルとして返す
   * @private
   */
  _symbolicEntry(i, j, n) {
    // 行分類
    // 補間条件: row 0 .. n-1
    if (i < n) {
      const k = i;
      if (j === 3*k)   return '1';
      if (j === 3*k+1) return '1';
      if (j === 3*k+2) return '1';
      return '0';
    }
    // 1階連続: row n .. 2n-2
    if (i < 2*n - 1) {
      const k = i - n;
      if (j === 3*k)     return '3/Δh<sub>k</sub>';
      if (j === 3*k+1)   return '2/Δh<sub>k</sub>';
      if (j === 3*k+2)   return '1/Δh<sub>k</sub>';
      if (j === 3*(k+1)+2) return '−1/Δh<sub>k+1</sub>';
      return '0';
    }
    // 2階連続: row 2n-1 .. 3n-3
    if (i < 3*n - 2) {
      const k = i - (2*n - 1);
      if (j === 3*k)     return '6/Δh<sub>k</sub>²';
      if (j === 3*k+1)   return '2/Δh<sub>k</sub>²';
      if (j === 3*(k+1)+1) return '−2/Δh<sub>k+1</sub>²';
      return '0';
    }
    // 左境界: row 3n-2
    if (i === 3*n - 2) {
      if (j === 1) return '2';
      return '0';
    }
    // 右境界: row 3n-1
    if (i === 3*n - 1) {
      if (j === 3*(n-1))   return '6/Δh<sub>n-1</sub>²';
      if (j === 3*(n-1)+1) return '2/Δh<sub>n-1</sub>²';
      return '0';
    }
    return '0';
  }

  /**
   * シンボリック右辺ベクトル [b] の HTML を生成
   * @private
   */
  _renderSymbolicRhs(n) {
    const size = 3 * n;
    const cellStyle = 'style="padding:4px 10px; font-size:0.82rem; font-family:monospace;"';

    const entries = [];
    for (let k = 0; k < n; k++)   entries.push(`y<sub>${k+1}</sub> − y<sub>${k}</sub>`);
    for (let k = 0; k < n-1; k++) entries.push('0');
    for (let k = 0; k < n-1; k++) entries.push('0');
    entries.push('0');  // 左境界
    entries.push('0');  // 右境界

    let html = '<div style="display:inline-block; overflow-x:auto;"><table class="matrix-table" style="width:auto;">';
    html += `<tr><th colspan="2" ${cellStyle}>右辺ベクトル [b]（${size}成分）</th></tr>`;
    html += `<tr><th ${cellStyle}>添字</th><th ${cellStyle}>値（一般式）</th></tr>`;
    for (let i = 0; i < size; i++) {
      html += `<tr><td ${cellStyle}>b[${i}]</td><td ${cellStyle}>${entries[i]}</td></tr>`;
    }
    html += '</table></div>';
    return html;
  }

  /**
   * 行列をHTMLテーブルで表示（列幅コンパクト版・小数3桁）
   * @private
   */
  _renderMatrixTable(matrix, label) {
    const n = matrix.length;
    // セル幅を固定して列幅をコンパクトに
    const cellStyle = 'style="padding:4px 6px; min-width:60px; max-width:75px; font-size:0.78rem;"';
    const hdStyle   = 'style="padding:4px 6px; font-size:0.78rem;"';

    let html = '<div style="overflow-x: auto; margin-bottom: 15px;">';
    html += '<table class="matrix-table">';

    // タイトル行
    html += `<tr><th colspan="${n + 1}">行列 [${label}]</th></tr>`;
    // 列ヘッダー
    html += `<tr><th ${hdStyle}> </th>`;
    for (let j = 0; j < n; j++) {
      html += `<th ${hdStyle}>c${j}</th>`;
    }
    html += '</tr>';

    // データ行
    for (let i = 0; i < n; i++) {
      html += `<tr><th ${hdStyle}>r${i}</th>`;
      for (let j = 0; j < n; j++) {
        const val = matrix[i][j];
        const display = Math.abs(val) < 1e-10 ? '0' : this._fmtNum(val);
        html += `<td ${cellStyle}>${display}</td>`;
      }
      html += '</tr>';
    }

    html += '</table></div>';
    return html;
  }

  /**
   * ベクトルをHTMLテーブルで表示（小数3桁）
   * @private
   */
  _renderVectorTable(vector, label) {
    const n = vector.length;
    const cellStyle = 'style="padding:4px 8px; font-size:0.82rem;"';

    let html = '<div style="overflow-x: auto; margin-bottom: 15px; display:inline-block;">';
    html += '<table class="matrix-table" style="width: auto;">';

    html += `<tr><th colspan="2" ${cellStyle}>ベクトル [${label}]</th></tr>`;
    html += `<tr><th ${cellStyle}>添字</th><th ${cellStyle}>値</th></tr>`;

    for (let i = 0; i < Math.min(n, 20); i++) {
      const val = vector[i][0];
      const display = Math.abs(val) < 1e-10 ? '0' : this._fmtNum(val);
      html += `<tr><td ${cellStyle}>b[${i}]</td><td ${cellStyle}>${display}</td></tr>`;
    }

    if (n > 20) {
      html += `<tr><td colspan="2" style="text-align:center;color:#999;font-size:0.8rem;">… (${n - 20} 行省略) …</td></tr>`;
    }

    html += '</table></div>';
    return html;
  }

  /**
   * 係数ベクトルをHTMLテーブルで表示（小数3桁）
   * @private
   */
  _renderCoefficientVector(coeff, n) {
    const cellStyle = 'style="padding:4px 8px; font-size:0.82rem;"';

    let html = '<div style="overflow-x: auto; margin-bottom: 15px; display:inline-block;">';
    html += '<table class="matrix-table" style="width: auto;">';

    html += `<tr><th colspan="2" ${cellStyle}>解ベクトル</th></tr>`;
    html += `<tr><th ${cellStyle}>係数</th><th ${cellStyle}>値</th></tr>`;

    for (let k = 0; k < n; k++) {
      const a = coeff[3 * k][0];
      const b = coeff[3 * k + 1][0];
      const c = coeff[3 * k + 2][0];

      html += `<tr><td ${cellStyle}>a<sub>${k}</sub></td><td ${cellStyle}>${this._fmtNum(a)}</td></tr>`;
      html += `<tr><td ${cellStyle}>b<sub>${k}</sub></td><td ${cellStyle}>${this._fmtNum(b)}</td></tr>`;
      html += `<tr><td ${cellStyle}>c<sub>${k}</sub></td><td ${cellStyle}>${this._fmtNum(c)}</td></tr>`;
    }

    html += '</table></div>';
    return html;
  }

  /**
   * 数値を読みやすい小数形式に変換するヘルパー（小数3桁）
   * @private
   */
  _fmtNum(val) {
    if (val === 0) return '0';
    const abs = Math.abs(val);
    // 桁が極端な場合のみ指数
    if (abs >= 1e10 || (abs < 1e-4 && abs > 0)) {
      return val.toExponential(3);
    }
    // 通常範囲は小数3桁
    return val.toFixed(3);
  }

  /**
   * グラフレンダリング（Chart.js使用）
   */
  renderChart(result) {
    const ctx = document.getElementById('chartCanvas');
    if (!ctx) return;

    // 既存のチャートを破棄
    if (window.currentChart) {
      window.currentChart.destroy();
    }

    // データセット準備
    const originalData = result.originalPoints.map(p => ({ x: p.x, y: p.y }));
    const interpolatedData = result.interpolated.map(p => ({ x: p.x, y: p.y }));

    // ---- 縦横1:1スケール計算 ----
    const allX = interpolatedData.map(p => p.x);
    const allY = interpolatedData.map(p => p.y);
    const xMin = Math.min(...allX), xMax = Math.max(...allX);
    const yMin = Math.min(...allY), yMax = Math.max(...allY);
    const margin = 0.05; // データ範囲の5%余白
    const xRange = (xMax - xMin) || 1;
    const yRange = (yMax - yMin) || 1;
    const halfRange = Math.max(xRange, yRange) / 2 * (1 + margin);
    const xMid = (xMax + xMin) / 2;
    const yMid = (yMax + yMin) / 2;
    const axisMin = axis => Math.floor((axis === 'x' ? xMid : yMid) - halfRange);
    const axisMax = axis => Math.ceil((axis === 'x' ? xMid : yMid) + halfRange);

    // Chart.js チャート作成
    window.currentChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: '元の点群',
            data: originalData,
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.7)',
            pointRadius: 6,
            pointHoverRadius: 8,
            showLine: false
          },
          {
            label: '補間曲線',
            data: interpolatedData,
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0)',
            pointRadius: 2,
            showLine: true,
            borderWidth: 2,
            tension: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1,
        plugins: {
          legend: { position: 'top' },
          title: {
            display: true,
            text: `スプライン補間（${result.mode === 'normal' ? '通常補間' : 'パラメトリック補間'}）`
          }
        },
        scales: {
          x: {
            type: 'linear',
            min: axisMin('x'),
            max: axisMax('x'),
            title: { display: true, text: 'X' },
            grid: {
              color: ctx2 => ctx2.tick.value === 0 ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.08)',
              lineWidth: ctx2 => ctx2.tick.value === 0 ? 2.5 : 1
            }
          },
          y: {
            min: axisMin('y'),
            max: axisMax('y'),
            title: { display: true, text: 'Y' },
            grid: {
              color: ctx2 => ctx2.tick.value === 0 ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.08)',
              lineWidth: ctx2 => ctx2.tick.value === 0 ? 2.5 : 1
            }
          }
        }
      }
    });
  }

  /**
   * エラー表示
   */
  showError(message) {
    const errorContainer = document.getElementById('errorContainer');
    if (errorContainer) {
      errorContainer.innerHTML = `<div class="error-box">${message.replace(/\n/g, '<br>')}</div>`;
    }
  }

  /**
   * 出力をコピー
   */
  copyOutput() {
    const outputTextarea = document.getElementById('outputPoints');
    if (!outputTextarea) return;

    outputTextarea.select();
    document.execCommand('copy');
    alert('出力をクリップボードにコピーしました');
  }

  /**
   * サンプルデータ読み込み（現在のモードに対応したサンプルをセット）
   */
  addSampleData() {
    const inputEl = document.getElementById('pointInput');
    if (!inputEl) return;
    inputEl.value = SAMPLE_DATA[this.currentMode];
    // サンプルをセットしたのでキャッシュをリセット（次に切り替えた際に改めてユーザー編集を検知できるよう）
    this._savedInput[this.currentMode] = null;
  }

  /**
   * モード説明の更新
   * モード切替時に呼ばれる。旧モードの入力を保存し、新モードの入力を復元する。
   * @param {string|null} prevMode - 切替前のモード（null の場合は保存スキップ）
   */
  updateModeDescription(prevMode = null) {
    const modeDesc = document.getElementById('modeDescription');
    const inputEl  = document.getElementById('pointInput');

    // ---- 旧モードの入力値を保存 ----
    if (prevMode && inputEl) {
      this._savedInput[prevMode] = inputEl.value;
    }

    // ---- 新モードの入力値を復元 ----
    this._setInputForMode(this.currentMode);

    // ---- モード説明テキストを更新 ----
    if (!modeDesc) return;
    if (this.currentMode === 'normal') {
      modeDesc.innerHTML = `
        <strong>通常補間（関数型）</strong><br>
        Y = f(X) の形で補間します。X が単調増加している必要があります。
      `;
    } else {
      modeDesc.innerHTML = `
        <strong>パラメトリック補間</strong><br>
        X = x(t), Y = y(t) の形で補間します。ループ状の曲線や X が単調増加でない場合に対応します。
      `;
    }
  }

  /**
   * 指定モードのテキストエリアに値をセットする
   * - ユーザーが保存済みの値があればそれを使う
   * - なければデフォルトのサンプルデータを使う
   * @private
   */
  _setInputForMode(mode) {
    const inputEl = document.getElementById('pointInput');
    if (!inputEl) return;
    const saved = this._savedInput[mode];
    inputEl.value = (saved !== null && saved !== undefined) ? saved : SAMPLE_DATA[mode];
  }

  /**
   * 全クリア
   */
  clearAll() {
    document.getElementById('pointInput').value = '';
    document.getElementById('outputPoints').value = '';
    document.getElementById('errorContainer').textContent = '';
    document.getElementById('resultSummary').innerHTML = '';

    // 新STEPレイアウトのプレースホルダーをリセット
    const placeholder = '<p class="val-placeholder">← 実行すると値が表示されます</p>';
    const stepIds = ['val-step1', 'val-step2', 'val-matrix-symbolic', 'val-matrix-A',
                     'val-rhs-symbolic', 'val-rhs-values', 'val-step4', 'val-step5'];
    for (const id of stepIds) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = placeholder;
    }
    const modeNote = document.getElementById('theory-mode-note');
    if (modeNote) modeNote.textContent = '';

    if (window.currentChart) {
      window.currentChart.destroy();
      window.currentChart = null;
    }

    this.currentResult = null;
  }
}

// ページロード時に初期化
document.addEventListener('DOMContentLoaded', () => {
  window.uiController = new UIController();
});
