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
-1,2`,
  closed: `0.1,0.693952
1.387822,1.267382
2.017411,1.892259
1.522497,2.707985
0.528143,2.456242
-0.88705,1.5`
};

class UIController {
  constructor() {
    this.currentResult = null;
    this.currentMode = 'normal';
    this.currentComponent = 'x';
    // モードごとにユーザーが入力したテキストを保持するキャッシュ
    // null = まだ何も編集していない（サンプルのまま）
    this._savedInput = {
      normal: null,
      parametric: null,
      closed: null
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

    // CSV保存ボタン
    document.getElementById('saveCsvBtn')?.addEventListener('click', () => this.saveCsv());

    // グラフ表示切替
    ['showOriginalPoints', 'showInterpolatedLine', 'showInterpolatedPoints', 'showOriginalLabels'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => {
        if (this.currentResult) this.renderChart(this.currentResult);
      });
    });

    document.addEventListener('click', (e) => {
      const detailCell = e.target.closest?.('.detail-cell');
      if (detailCell) {
        this.openCalculationDetail(detailCell.dataset.detail);
        return;
      }
      if (e.target.closest?.('[data-modal-close]')) {
        this.closeCalculationDetail();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeCalculationDetail();
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('detail-cell')) {
        e.preventDefault();
        this.openCalculationDetail(e.target.dataset.detail);
      }
    });

    document.querySelectorAll('.component-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentComponent = btn.dataset.component || 'x';
        this.updateComponentSelector();
        if (this.currentResult) this.displayLearningContent(this.currentResult);
      });
    });
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
    const outputPointCount = parseInt(document.getElementById('divNum')?.value || '30');

    if (outputPointCount < 2) {
      this.showError('補間後の出力点数は2以上の整数である必要があります');
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
      const xArr = points.map(p => p.x);
      const yArr = points.map(p => p.y);
      const totalDivisions = outputPointCount - 1;
      if (this.currentMode === 'normal') {
        result = SplineInterpolationEngine.normalSplineInterpolation(xArr, yArr, totalDivisions);
      } else if (this.currentMode === 'closed') {
        result = SplineInterpolationEngine.closedSplineInterpolation(xArr, yArr, outputPointCount);
      } else {
        result = SplineInterpolationEngine.parametricSplineInterpolation(xArr, yArr, totalDivisions, 'uniform');
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
        <p>モード: ${this._modeLabel(result.mode)}</p>
      `;
    }
  }

  /**
   * 学習用表示内容 — 新STEPレイアウト対応版
   * index.html の各 val-step* プレースホルダーに実際の値を注入する
   */
  displayLearningContent(result) {
    const n = result.details.n;
    const component = result.mode === 'closed' ? this.currentComponent : 'x';
    const activeEngine = this._activeEngine(result);
    this.updateComponentSelector(result);
    this.updateClosedLearningText(result.mode, component, result);

    // ---- 概要エリア：モードノート ----
    const modeNoteEl = document.getElementById('theory-mode-note');
    if (modeNoteEl) {
      if (result.mode === 'normal') {
        modeNoteEl.textContent = '現在のモード: 通常補間（Y = f(X)） — X 座標を独立変数として補間します。';
      } else if (result.mode === 'closed') {
        modeNoteEl.textContent = '現在のモード: 閉曲線補間 — 入力点列を周期的につなぎ、最終区間から始点へ滑らかに戻します。';
      } else {
        modeNoteEl.textContent = `現在のモード: パラメトリック補間（X = x(t), Y = y(t)） — 等間隔パラメータ t を使用します。`;
      }
    }
    this.updateConditionCards(result.mode);

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
          const x0 = result.originalPoints[k].x;
          const x1 = result.originalPoints[k + 1].x;
          html += this._detailCell(this._fmtNum(result.intervals[k]), `区間幅 Δh_${k}`, [
            ['条件', `通常補間の区間 k=${k}`],
            ['一般式', `Δh_${k} = x_${k + 1} - x_${k}`],
            ['代入', `${this._fmtNum(x1)} - ${this._fmtNum(x0)}`],
            ['結果', this._fmtNum(result.intervals[k])]
          ]);
        }
      } else if (result.mode === 'closed') {
        html += '<td>h</td>';
        for (let k = 0; k < n; k++) {
          html += this._detailCell(this._fmtNum(result.intervals[k]), '閉曲線の共通区間幅 h', [
            ['条件', `閉曲線補間の区間 k=${k}`],
            ['一般式', 'h = 1 / N'],
            ['代入', `1 / ${n}`],
            ['結果', this._fmtNum(result.intervals[k])]
          ]);
        }
      } else {
        html += '<td>Δt<sub>k</sub></td>';
        for (let k = 0; k < n; k++) {
          html += this._detailCell(this._fmtNum(result.intervals[k]), `パラメータ区間幅 Δt_${k}`, [
            ['条件', `パラメトリック補間の区間 k=${k}`],
            ['一般式', `Δt_${k} = t_${k + 1} - t_${k}`],
            ['代入', `${this._fmtNum(result.parameters[k + 1])} - ${this._fmtNum(result.parameters[k])}`],
            ['結果', this._fmtNum(result.intervals[k])]
          ]);
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
      } else if (result.mode === 'closed') {
        html += '<tr><td>t<sub>k</sub></td>';
        for (let k = 0; k < n; k++) html += `<td>${this._fmtNum(result.parameters[k])}</td>`;
        html += '</tr><tr><td>t<sub>k+1</sub></td>';
        for (let k = 0; k < n; k++) html += `<td>${this._fmtNum(result.parameters[k+1])}</td>`;
        html += '</tr><tr><td>接続先</td>';
        for (let k = 0; k < n; k++) html += `<td>P<sub>${(k + 1) % n}</sub></td>`;
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
      if (result.mode === 'closed') {
        step2El.innerHTML = this._renderKnownConstantTable(result, component);
      } else {
        step2El.innerHTML = this._renderIntervalCoefficientTable(activeEngine ? activeEngine.coefficients : result.coefficients, n, result, component);
      }
    }

    // ---- STEP 3: 行列方程式（一般式＋実際の値）----
    // 一般式：点数に合わせたシンボリック行列
    const matSymEl = document.getElementById('val-matrix-symbolic');
    if (matSymEl) {
      matSymEl.innerHTML = this._renderSymbolicMatrix(n, result.mode);
    }

    const rhsSymEl = document.getElementById('val-rhs-symbolic');
    if (rhsSymEl) {
      rhsSymEl.innerHTML = this._renderSymbolicRhs(n, result.mode, component);
    }

    // 実際の係数行列 [A]
    const matAEl = document.getElementById('val-matrix-A');
    if (matAEl) {
      if (n <= 6) {
        matAEl.innerHTML = this._renderMatrixTable(result.matrix, 'A', result);
      } else {
        matAEl.innerHTML = `<p style="color:#888; font-style:italic;">区間数 ${n} が大きいため行列表示を省略しています（6区間以下で表示）。</p>`;
      }
    }

    const rhsValEl = document.getElementById('val-rhs-values');
    if (rhsValEl) {
      const vector = activeEngine ? activeEngine.vector : result.vector;
      rhsValEl.innerHTML = this._renderVectorTable(vector, 'b', result, component);
    }

    // ---- STEP 4: 解ベクトル ----
    const step4El = document.getElementById('val-step4');
    if (step4El) {
      const coeff = activeEngine ? activeEngine.coefficients : result.coefficients;
      const vectorHtml = this._renderCoefficientVector(coeff, n, result, component);
      const coeffHtml = result.mode === 'closed'
        ? `
          <div style="margin-top:18px; border-top:1px solid #e0e0e0; padding-top:14px;">
            <div class="theory-col-head">計算結果（各区間の係数）</div>
            ${this._renderIntervalCoefficientTable(coeff, n, result, component)}
          </div>`
        : '';
      step4El.innerHTML = vectorHtml + coeffHtml;
    }

    // ---- STEP 5: 確定した各区間のスプライン式 ----
    const step5El = document.getElementById('val-step5');
    if (step5El) {
      let html = '';
      for (let k = 0; k < n; k++) {
        const coeff = activeEngine ? activeEngine.coefficients : result.coefficients;
        const a = coeff[3*k][0];
        const b = coeff[3*k+1][0];
        const c = coeff[3*k+2][0];

        let rangeLabel, hDef, dVal;
        if (result.mode === 'normal') {
          const x0 = result.originalPoints[k].x;
          const x1 = result.originalPoints[k+1].x;
          dVal = result.originalPoints[k].y;
          rangeLabel = `x ∈ [${this._fmtNum(x0)}, ${this._fmtNum(x1)}]`;
          hDef = `h = (x − ${this._fmtNum(x0)}) / ${this._fmtNum(result.intervals[k])}`;
        } else if (result.mode === 'closed') {
          const t0 = result.parameters[k];
          const t1 = result.parameters[k+1];
          dVal = this._componentPointValue(result, k, component);
          rangeLabel = `t ∈ [${this._fmtNum(t0)}, ${this._fmtNum(t1)}]`;
          hDef = `localH = t − ${this._fmtNum(t0)}（0 ≤ localH ≤ ${this._fmtNum(result.intervals[k])}）`;
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

        const componentName = result.mode === 'closed' ? component.toUpperCase() : 'S';
        const suffix = result.mode === 'closed' ? this._componentSuffix(result, component) : '';
        if (result.mode === 'closed') {
          const q = component === 'y' ? 'y' : 'x';
          html += `
            <div style="background:#f9f9f9; padding:14px; border-left:3px solid #0066cc; margin-bottom:14px; border-radius:4px;">
              <p style="font-weight:600; margin-bottom:6px;">区間 k = ${k}　（${rangeLabel}）</p>
              <p style="font-family:'Courier New',monospace; line-height:1.8;">
                F<sub>${q},${k}</sub>(t) =
                  a<sub>${q},${k}</sub>(t-t<sub>${k}</sub>)³ +
                  b<sub>${q},${k}</sub>(t-t<sub>${k}</sub>)² +
                  c<sub>${q},${k}</sub>(t-t<sub>${k}</sub>) +
                  d<sub>${q},${k}</sub><br>
                F<sub>${q},${k}</sub>(t) =
                  a<sub>${q},${k}</sub>·localH³ +
                  b<sub>${q},${k}</sub>·localH² +
                  c<sub>${q},${k}</sub>·localH +
                  d<sub>${q},${k}</sub><br>
                F<sub>${q},${k}</sub>(t) = ${this._fmtNum(a)}·localH³
                  ${aSign} ${this._fmtNum(bAbs)}·localH²
                  ${cSign} ${this._fmtNum(cAbs)}·localH
                  ${dSign} ${this._fmtNum(dAbs)}
              </p>
              <p style="font-size:0.88rem; color:#666; margin-top:6px;">※ ${hDef}</p>
            </div>`;
          continue;
        }

        html += `
          <div style="background:#f9f9f9; padding:14px; border-left:3px solid #0066cc; margin-bottom:14px; border-radius:4px;">
            <p style="font-weight:600; margin-bottom:6px;">区間 k = ${k}　（${rangeLabel}）</p>
            <p style="font-family:'Courier New',monospace; line-height:1.8;">
              ${componentName}<sub>${k}</sub>(h) =
                a<sub>${suffix}${k}</sub>·h³ +
                b<sub>${suffix}${k}</sub>·h² +
                c<sub>${suffix}${k}</sub>·h +
                d<sub>${suffix}${k}</sub><br>
              ${componentName}<sub>${k}</sub>(h) = ${this._fmtNum(a)}·h³
                ${aSign} ${this._fmtNum(bAbs)}·h²
                ${cSign} ${this._fmtNum(cAbs)}·h
                ${dSign} ${this._fmtNum(dAbs)}
            </p>
            <p style="font-size:0.88rem; color:#666; margin-top:6px;">※ ${hDef}${result.mode === 'closed' ? '' : '　（0 ≤ h ≤ 1）'}</p>
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
  _renderSymbolicMatrix(n, mode = 'normal') {
    const size = 3 * n;
    // 行ラベル
    const rowLabels = [];
    if (mode === 'closed') {
      for (let k = 0; k < n; k++) rowLabels.push(`位置(k=${k})`);
      for (let k = 0; k < n; k++) rowLabels.push(k === n - 1 ? `1次周期(k=${k}, 最後→最初)` : `1次周期(k=${k})`);
      for (let k = 0; k < n; k++) rowLabels.push(k === n - 1 ? `2次周期(k=${k}, 最後→最初)` : `2次周期(k=${k})`);
    } else {
      for (let k = 0; k < n; k++)     rowLabels.push(`補間(k=${k})`);
      for (let k = 0; k < n-1; k++)   rowLabels.push(`1次連続(k=${k})`);
      for (let k = 0; k < n-1; k++)   rowLabels.push(`2次連続(k=${k})`);
      rowLabels.push('境界(左端)');
      rowLabels.push('境界(右端)');
    }

    const cellStyle = 'style="padding:3px 5px; font-size:0.75rem; font-family:monospace; min-width:50px; text-align:center;"';
    const hdStyle   = 'style="padding:3px 5px; font-size:0.72rem;"';

    // 列ラベル: a0 b0 c0  a1 b1 c1 ...
    const colLabels = [];
    for (let k = 0; k < n; k++) {
      colLabels.push(`a<sub>${k}</sub>`, `b<sub>${k}</sub>`, `c<sub>${k}</sub>`);
    }

    let html = '<div style="overflow-x:auto;">';
    if (mode === 'closed') {
      html += this._conditionLegendHtml();
    }
    html += '<table class="matrix-table">';
    html += `<tr><th colspan="${size+1}" style="font-size:0.8rem;">係数行列 [A]（${size}×${size}）— 非ゼロ成分のみ表示</th></tr>`;
    html += `<tr><th ${hdStyle}>条件</th>`;
    for (let j = 0; j < size; j++) html += `<th ${hdStyle}>${colLabels[j]}</th>`;
    html += '</tr>';

    // 各行を生成
    for (let i = 0; i < size; i++) {
      html += `<tr class="${this._conditionRowClass(i, n, mode)}"><th ${hdStyle} style="text-align:left;">${rowLabels[i]}</th>`;
      for (let j = 0; j < size; j++) {
        const sym = this._symbolicEntry(i, j, n, mode);
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
  _symbolicEntry(i, j, n, mode = 'normal') {
    if (mode === 'closed') {
      const h = 'h';
      if (i < n) {
        const k = i;
        if (j === 3*k) return `${h}³`;
        if (j === 3*k+1) return `${h}²`;
        if (j === 3*k+2) return h;
        return '0';
      }
      if (i < 2*n) {
        const k = i - n;
        const nextK = (k + 1) % n;
        if (j === 3*k) return `3${h}²`;
        if (j === 3*k+1) return `2${h}`;
        if (j === 3*k+2) return '1';
        if (j === 3*nextK+2) return '−1';
        return '0';
      }
      if (i < 3*n) {
        const k = i - 2*n;
        const nextK = (k + 1) % n;
        if (j === 3*k) return `3${h}`;
        if (j === 3*k+1) return '1';
        if (j === 3*nextK+1) return '−1';
        return '0';
      }
      return '0';
    }

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
  _renderSymbolicRhs(n, mode = 'normal', component = 'x') {
    const size = 3 * n;
    const cellStyle = 'style="padding:4px 10px; font-size:0.82rem; font-family:monospace;"';

    const entries = [];
    if (mode === 'closed') {
      for (let k = 0; k < n; k++) entries.push(`${component}<sub>${(k + 1) % n}</sub> − ${component}<sub>${k}</sub>`);
      for (let k = 0; k < n; k++) entries.push('0');
      for (let k = 0; k < n; k++) entries.push('0');
    } else {
      for (let k = 0; k < n; k++)   entries.push(`y<sub>${k+1}</sub> − y<sub>${k}</sub>`);
      for (let k = 0; k < n-1; k++) entries.push('0');
      for (let k = 0; k < n-1; k++) entries.push('0');
      entries.push('0');  // 左境界
      entries.push('0');  // 右境界
    }

    let html = '<div style="display:inline-block; overflow-x:auto;">';
    if (mode === 'closed') {
      html += this._conditionLegendHtml();
    }
    html += '<table class="matrix-table" style="width:auto;">';
    html += `<tr><th colspan="2" ${cellStyle}>右辺ベクトル [b]（${size}成分）</th></tr>`;
    html += `<tr><th ${cellStyle}>添字</th><th ${cellStyle}>値（一般式）</th></tr>`;
    for (let i = 0; i < size; i++) {
      html += `<tr class="${this._conditionRowClass(i, n, mode)}"><td ${cellStyle}>b[${i}]</td><td ${cellStyle}>${entries[i]}</td></tr>`;
    }
    html += '</table></div>';
    return html;
  }

  /**
   * 行列をHTMLテーブルで表示（列幅コンパクト版・小数3桁）
   * @private
   */
  _renderMatrixTable(matrix, label, result = null) {
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
      html += `<tr class="${result ? this._conditionRowClass(i, result.details.n, result.mode) : ''}"><th ${hdStyle}>r${i}</th>`;
      for (let j = 0; j < n; j++) {
        const val = matrix[i][j];
        const display = Math.abs(val) < 1e-10 ? '0' : this._fmtNum(val);
        if (result) {
          html += this._detailCell(display, `行列 ${label}[${i}, ${j}]`, this._matrixCellDetailRows(i, j, val, result), cellStyle);
        } else {
          html += `<td ${cellStyle}>${display}</td>`;
        }
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
  _renderVectorTable(vector, label, result = null, component = 'x') {
    const n = vector.length;
    const cellStyle = 'style="padding:4px 8px; font-size:0.82rem;"';

    let html = '<div style="overflow-x: auto; margin-bottom: 15px; display:inline-block;">';
    html += '<table class="matrix-table" style="width: auto;">';

    html += `<tr><th colspan="2" ${cellStyle}>ベクトル [${label}]</th></tr>`;
    html += `<tr><th ${cellStyle}>添字</th><th ${cellStyle}>値</th></tr>`;

    for (let i = 0; i < Math.min(n, 20); i++) {
      const val = vector[i][0];
      const display = Math.abs(val) < 1e-10 ? '0' : this._fmtNum(val);
      const valueCell = result
        ? this._detailCell(display, `ベクトル ${label}[${i}]`, this._vectorCellDetailRows(i, val, result, component), cellStyle)
        : `<td ${cellStyle}>${display}</td>`;
      html += `<tr class="${result ? this._conditionRowClass(i, result.details.n, result.mode) : ''}"><td ${cellStyle}>b[${i}]</td>${valueCell}</tr>`;
    }

    if (n > 20) {
      html += `<tr><td colspan="2" style="text-align:center;color:#999;font-size:0.8rem;">… (${n - 20} 行省略) …</td></tr>`;
    }

    html += '</table></div>';
    return html;
  }

  _renderKnownConstantTable(result, component = 'x') {
    const n = result.details.n;
    const q = component === 'y' ? 'y' : 'x';
    const cellStyle = 'style="padding:4px 8px; font-size:0.82rem;"';
    let html = `
      <p class="closed-step-note">
        始点条件 \\(F_{${q},k}(t_k)=${q}_k\\) より、定数項は
        \\(d_{${q},k}=${q}_k\\) と確定します。ここではまだ
        \\(a_{${q},k}, b_{${q},k}, c_{${q},k}\\) は求めず、次のSTEPで条件式を行列に入れます。
      </p>
      <div style="overflow-x:auto; display:inline-block;">
      <table class="matrix-table" style="width:auto;">
      <tr><th ${cellStyle}>k</th><th ${cellStyle}>始点</th><th ${cellStyle}>既知の定数項</th><th ${cellStyle}>値</th></tr>`;

    for (let k = 0; k < n; k++) {
      const d = this._componentPointValue(result, k, component);
      html += `<tr>
        <td ${cellStyle}>${k}</td>
        <td ${cellStyle}>${q}<sub>${k}</sub></td>
        <td ${cellStyle}>d<sub>${q},${k}</sub> = ${q}<sub>${k}</sub></td>
        ${this._detailCell(this._fmtNum(d), `定数項 d_${q},${k}`, [
          ['条件', `区間 k=${k} の始点条件`],
          ['一般式', `F_${q},${k}(t_${k}) = ${q}_${k} = d_${q},${k}`],
          ['代入', `${q}_${k} = ${this._fmtNum(d)}`],
          ['結果', `d_${q},${k} = ${this._fmtNum(d)}`]
        ], cellStyle)}
      </tr>`;
    }

    html += '</table></div>';
    return html;
  }

  _renderIntervalCoefficientTable(coeff, n, result = null, component = 'x') {
    const suffix = result ? this._componentSuffix(result, component) : '';
    let html = '<table class="matrix-table" style="width:auto;">';
    html += `<tr><th>k</th><th>a<sub>${suffix}k</sub></th><th>b<sub>${suffix}k</sub></th><th>c<sub>${suffix}k</sub></th><th>d<sub>${suffix}k</sub></th></tr>`;
    for (let k = 0; k < n; k++) {
      const a = coeff[3*k][0];
      const b = coeff[3*k+1][0];
      const c = coeff[3*k+2][0];
      const d = result ? this._componentPointValue(result, k, component) : 0;
      html += `<tr><td>${k}</td>`;
      html += result
        ? this._detailCell(this._fmtNum(a), `係数 a_${suffix}${k}`, this._coefficientDetailRows('a', k, a, result, component))
        : `<td>${this._fmtNum(a)}</td>`;
      html += result
        ? this._detailCell(this._fmtNum(b), `係数 b_${suffix}${k}`, this._coefficientDetailRows('b', k, b, result, component))
        : `<td>${this._fmtNum(b)}</td>`;
      html += result
        ? this._detailCell(this._fmtNum(c), `係数 c_${suffix}${k}`, this._coefficientDetailRows('c', k, c, result, component))
        : `<td>${this._fmtNum(c)}</td>`;
      html += result
        ? this._detailCell(this._fmtNum(d), `定数項 d_${suffix}${k}`, [
            ['条件', `区間 k=${k} の始点値`],
            ['一般式', this._componentVariable(result, component, k, true)],
            ['結果', this._fmtNum(d)]
          ])
        : `<td>${this._fmtNum(d)}</td>`;
      html += '</tr>';
    }
    html += '</table>';
    return html;
  }

  /**
   * 係数ベクトルをHTMLテーブルで表示（小数3桁）
   * @private
   */
  _renderCoefficientVector(coeff, n, result = null, component = 'x') {
    const cellStyle = 'style="padding:4px 8px; font-size:0.82rem;"';

    let html = '<div style="overflow-x: auto; margin-bottom: 15px; display:inline-block;">';
    html += '<table class="matrix-table" style="width: auto;">';

    html += `<tr><th colspan="2" ${cellStyle}>解ベクトル</th></tr>`;
    html += `<tr><th ${cellStyle}>係数</th><th ${cellStyle}>値</th></tr>`;

    for (let k = 0; k < n; k++) {
      const a = coeff[3 * k][0];
      const b = coeff[3 * k + 1][0];
      const c = coeff[3 * k + 2][0];

      const suffix = result ? this._componentSuffix(result, component) : '';
      const aCell = result ? this._detailCell(this._fmtNum(a), `解ベクトル a_${suffix}${k}`, this._coefficientDetailRows('a', k, a, result, component), cellStyle) : `<td ${cellStyle}>${this._fmtNum(a)}</td>`;
      const bCell = result ? this._detailCell(this._fmtNum(b), `解ベクトル b_${suffix}${k}`, this._coefficientDetailRows('b', k, b, result, component), cellStyle) : `<td ${cellStyle}>${this._fmtNum(b)}</td>`;
      const cCell = result ? this._detailCell(this._fmtNum(c), `解ベクトル c_${suffix}${k}`, this._coefficientDetailRows('c', k, c, result, component), cellStyle) : `<td ${cellStyle}>${this._fmtNum(c)}</td>`;
      html += `<tr><td ${cellStyle}>a<sub>${suffix}${k}</sub></td>${aCell}</tr>`;
      html += `<tr><td ${cellStyle}>b<sub>${suffix}${k}</sub></td>${bCell}</tr>`;
      html += `<tr><td ${cellStyle}>c<sub>${suffix}${k}</sub></td>${cCell}</tr>`;
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

  _detailCell(content, title, rows, attrs = '') {
    const detail = encodeURIComponent(JSON.stringify({ title, rows }));
    const safeContent = String(content);
    const attrText = attrs ? `${attrs} ` : '';
    return `<td ${attrText}class="detail-cell" tabindex="0" data-detail="${this._escapeAttr(detail)}">${safeContent}</td>`;
  }

  _coefficientDetailRows(symbol, k, value, result, component = 'x') {
    const displayComponent = result.mode === 'normal' ? 'y' : component;
    const suffix = this._componentSuffix(result, component);
    return [
      ['対象', `${displayComponent} 側の ${symbol}_${suffix}${k}`],
      ['一般式', `{係数} = [A]^-1 {b}`],
      ['並び順', `{係数}[${3 * k + this._coefficientOffset(symbol)}] = ${symbol}_${suffix}${k}`],
      ['結果', this._fmtNum(value)],
      ['補足', result.mode === 'closed' ? '閉曲線補間では X(t) と Y(t) を同じ係数行列で別々に解きます。' : (result.mode === 'normal' ? '通常補間では y=f(x) の係数を表示しています。' : 'パラメトリック補間では x(t) 側の係数を表示しています。')]
    ];
  }

  _coefficientOffset(symbol) {
    if (symbol === 'a') return 0;
    if (symbol === 'b') return 1;
    return 2;
  }

  _matrixCellDetailRows(row, col, value, result) {
    const n = result.details.n;
    const mode = result.mode;
    const rowDesc = this._matrixRowDescription(row, n, mode);
    const colDesc = this._coefficientNameFromColumn(col);
    const symbolic = this._symbolicEntry(row, col, n, mode).replace(/<[^>]+>/g, '');
    const rows = [
      ['行', `r${row}: ${rowDesc}`],
      ['列', `c${col}: ${colDesc}`],
      ['セルの一般式', symbolic],
      ['実際の値', this._fmtNum(value)]
    ];

    if (mode === 'closed') {
      rows.splice(3, 0, ['パラメータ', `h = 1 / ${n} = ${this._fmtNum(result.details.h)}`]);
    } else {
      rows.splice(3, 0, ['区間幅', this._matrixIntervalNote(row, col, result)]);
    }
    return rows;
  }

  _vectorCellDetailRows(row, value, result, component = 'x') {
    const n = result.details.n;
    const mode = result.mode;
    const rowDesc = this._matrixRowDescription(row, n, mode);
    const rows = [
      ['行', `b[${row}]: ${rowDesc}`],
      ['一般式', this._rhsExpression(row, result, component)],
      ['代入', this._rhsSubstitution(row, result, component)],
      ['結果', this._fmtNum(value)]
    ];
    if (mode === 'closed') {
      rows.push(['補足', `現在は ${component.toUpperCase()}(t) 側の右辺ベクトルを表示しています。`]);
    } else if (mode !== 'normal') {
      rows.push(['補足', '表示している右辺ベクトルは x(t) 側です。']);
    }
    return rows;
  }

  _matrixRowDescription(row, n, mode) {
    if (mode === 'closed') {
      if (row < n) return `位置条件 k=${row}`;
      if (row < 2 * n) {
        const k = row - n;
        return k === n - 1 ? `1階導関数の周期条件 k=${k}（最後→最初）` : `1階導関数の周期条件 k=${k}`;
      }
      const k = row - 2 * n;
      return k === n - 1 ? `2階導関数の周期条件 k=${k}（最後→最初）` : `2階導関数の周期条件 k=${k}`;
    }
    if (row < n) return `補間条件 k=${row}`;
    if (row < 2 * n - 1) return `1階導関数連続条件 k=${row - n}`;
    if (row < 3 * n - 2) return `2階導関数連続条件 k=${row - (2 * n - 1)}`;
    if (row === 3 * n - 2) return '左端の自然境界条件';
    return '右端の自然境界条件';
  }

  _coefficientNameFromColumn(col, component = '') {
    const k = Math.floor(col / 3);
    const mod = col % 3;
    const suffix = component ? `${component},` : '';
    if (mod === 0) return `a_${suffix}${k}`;
    if (mod === 1) return `b_${suffix}${k}`;
    return `c_${suffix}${k}`;
  }

  _matrixIntervalNote(row, col, result) {
    const n = result.details.n;
    const intervals = result.intervals || [];
    if (row < n) return '補間条件の係数なので正規化後の 1 を使用します。';
    const k = Math.floor(col / 3);
    const h = intervals[k];
    if (h === undefined) return 'このセルは境界条件またはゼロ成分です。';
    return `Δ = ${this._fmtNum(h)}（列 ${this._coefficientNameFromColumn(col)} の区間幅）`;
  }

  _rhsExpression(row, result, component = 'x') {
    const n = result.details.n;
    if (result.mode === 'closed') {
      if (row < n) return `${component}_${(row + 1) % n} - ${component}_${row}`;
      return '0';
    }
    if (row < n) {
      return result.mode === 'normal' ? `y_${row + 1} - y_${row}` : `x_${row + 1} - x_${row}`;
    }
    return '0';
  }

  _rhsSubstitution(row, result, component = 'x') {
    const n = result.details.n;
    if (result.mode === 'closed') {
      if (row >= n) return '0';
      const current = this._componentPointValue(result, row, component);
      const next = this._componentPointValue(result, (row + 1) % n, component);
      return `${this._fmtNum(next)} - ${this._fmtNum(current)}`;
    }
    if (row >= n) return '0';
    if (result.mode === 'normal') {
      const current = result.originalPoints[row].y;
      const next = result.originalPoints[row + 1].y;
      return `${this._fmtNum(next)} - ${this._fmtNum(current)}`;
    }
    const current = result.originalPoints[row].x;
    const next = result.originalPoints[row + 1].x;
    return `${this._fmtNum(next)} - ${this._fmtNum(current)}`;
  }

  _activeEngine(result) {
    if (result.mode !== 'closed') return null;
    return this.currentComponent === 'y' ? result.yEngine : result.xEngine;
  }

  _componentPointValue(result, index, component = 'x') {
    if (result.mode === 'normal') return result.originalPoints[index].y;
    return component === 'y' ? result.originalPoints[index].y : result.originalPoints[index].x;
  }

  _componentSuffix(result, component = 'x') {
    if (result.mode !== 'closed') return '';
    return `${component},`;
  }

  _componentVariable(result, component, k, isConstant = false) {
    if (result.mode === 'normal') return isConstant ? `d_${k} = y_${k}` : `y_${k}`;
    const prefix = component === 'y' ? 'y' : 'x';
    return isConstant ? `d_${prefix},${k} = ${prefix}_${k}` : `${prefix}_${k}`;
  }

  updateComponentSelector(result = this.currentResult) {
    const selector = document.getElementById('componentSelector');
    if (!selector) return;
    const show = result?.mode === 'closed';
    selector.style.display = show ? 'inline-flex' : 'none';
    selector.querySelectorAll('.component-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.component === this.currentComponent);
    });
  }

  updateConditionCards(mode) {
    document.querySelectorAll('.cond-item').forEach((item, index) => {
      item.classList.remove('condition-card-position', 'condition-card-first', 'condition-card-second', 'condition-card-boundary');
      if (mode !== 'closed') return;
      if (index === 0) item.classList.add('condition-card-position');
      if (index === 1) item.classList.add('condition-card-first');
      if (index === 2) item.classList.add('condition-card-second');
      if (index === 3) item.classList.add('condition-card-boundary');
    });
  }

  _closedDerivationHtml(q, n = 0) {
    const countText = n > 0 ? `${n}` : 'N';
    const threeNText = n > 0 ? `${3 * n}` : '3N';
    const lastK = n > 0 ? `${n - 1}` : 'N-1';
    return `
      <div class="closed-derivation-block">
        <div class="closed-derivation-title">条件式を行列に入れる前の導出</div>
        <p>
          参考記事の流れに合わせ、まず始点条件で定数項を取り除きます。
          \\(F_{${q},k}(t_k)=${q}_k\\) より
          \\(d_{${q},k}=${q}_k\\) なので、未知数は
          \\(a_{${q},k}, b_{${q},k}, c_{${q},k}\\) だけになります。
          区間数は \\(N=${countText}\\)、未知数は \\(${threeNText}\\) 個です。
        </p>
        <p>
          閉曲線では、最後の区間 \\(k=N-1\\) の終点 \\(t_N\\) が先頭点 \\(t_0\\) に戻ります。
          そのため、内部接合点では \\(k+1\\) の区間とつなぎ、最後の区間だけは
          \\(k+1\\) を 0 として \\(F_{${q},0}\\) とつなぎます。
        </p>
        <div class="closed-equation-list">
          <div class="closed-equation-card condition-card-position">
            <strong>位置条件（各区間の終点を通る）</strong>
            <div class="formula-inline">\\(F_{${q},k}(t_{k+1})=${q}_{k+1}\\)</div>
            <div class="formula-inline">\\(a_{${q},k}h^3+b_{${q},k}h^2+c_{${q},k}h=${q}_{k+1}-${q}_k\\)</div>
            <p>この式の係数が、行列 [A] の位置条件行と右辺ベクトル \\({b}\\) の差分値になります。</p>
          </div>
          <div class="closed-equation-card condition-card-first">
            <strong>1階周期条件（接線方向をつなぐ）</strong>
            <div class="formula-inline">内部: \\(F'_{${q},k}(t_{k+1})=F'_{${q},k+1}(t_{k+1})\\quad(k=0,\\ldots,N-2)\\)</div>
            <div class="formula-inline">内部: \\(3a_{${q},k}h^2+2b_{${q},k}h+c_{${q},k}-c_{${q},k+1}=0\\)</div>
            <div class="formula-inline closed-loop-formula">最後→最初: \\(F'_{${q},N-1}(t_N)=F'_{${q},0}(t_0)\\)</div>
            <div class="formula-inline closed-loop-formula">最後→最初: \\(3a_{${q},N-1}h^2+2b_{${q},N-1}h+c_{${q},N-1}-c_{${q},0}=0\\)</div>
            <p>行列では、1階周期の最後の行 \\(k=${lastK}\\) だけ先頭区間の \\(c_{${q},0}\\) に -1 が入ります。</p>
          </div>
          <div class="closed-equation-card condition-card-second">
            <strong>2階周期条件（曲率のつながりをそろえる）</strong>
            <div class="formula-inline">内部: \\(F''_{${q},k}(t_{k+1})=F''_{${q},k+1}(t_{k+1})\\quad(k=0,\\ldots,N-2)\\)</div>
            <div class="formula-inline">内部: \\(3a_{${q},k}h+b_{${q},k}-b_{${q},k+1}=0\\)</div>
            <div class="formula-inline closed-loop-formula">最後→最初: \\(F''_{${q},N-1}(t_N)=F''_{${q},0}(t_0)\\)</div>
            <div class="formula-inline closed-loop-formula">最後→最初: \\(3a_{${q},N-1}h+b_{${q},N-1}-b_{${q},0}=0\\)</div>
            <p>行列では、2階周期の最後の行 \\(k=${lastK}\\) だけ先頭区間の \\(b_{${q},0}\\) に -1 が入ります。</p>
          </div>
        </div>
        <p class="closed-loop-note">
          下の行列では、この「最後→最初」の2行を通常の周期条件より濃い色で表示しています。
          左側の先頭区間の列に -1 が出る理由を、上の式と見比べて確認できます。
        </p>
      </div>`;
  }

  updateClosedLearningText(mode, component = 'x', result = null) {
    const positionFormula = document.querySelector('[data-condition-formula="position"]');
    const firstFormula = document.querySelector('[data-condition-formula="first"]');
    const secondFormula = document.querySelector('[data-condition-formula="second"]');
    const boundaryFormula = document.querySelector('[data-condition-formula="boundary"]');
    const step1Title = document.getElementById('step1-title');
    const step2Title = document.getElementById('step2-title');
    const step2Desc = document.getElementById('step2-general-description');
    const step2Formula = document.getElementById('step2-formula-box');
    const step2Note = document.getElementById('step2-general-note');
    const step2ValuesHead = document.getElementById('step2-values-head');
    const step3Intro = document.getElementById('step3-intro');
    const derivation = document.getElementById('closed-condition-derivation');
    const summary = document.getElementById('closed-unknown-summary');
    const step1Desc = document.getElementById('step1-general-description');
    const step1Formula = document.getElementById('step1-formula-box');
    const step1Note = document.getElementById('step1-general-note');

    if (mode === 'closed') {
      const q = component === 'y' ? 'y' : 'x';
      const label = component === 'y' ? 'Y(t)' : 'X(t)';
      const n = result?.details?.n ?? 0;
      const countText = n > 0 ? `${n}` : 'N';
      const threeNText = n > 0 ? `${3 * n}` : '3N';
      if (step1Title) step1Title.innerHTML = 'STEP 1　閉曲線の未知数とパラメータ設定';
      if (step2Title) step2Title.innerHTML = 'STEP 2　定数項 d の確定と未知数の整理';
      if (summary) {
        summary.style.display = 'block';
        summary.innerHTML = `
          <p><strong>閉曲線補間では、入力点数 N と同じ数の区間を周期的に扱います。</strong></p>
          <div class="unknown-count-grid">
            <div class="unknown-count-item">入力点数 / 区間数<strong>N = ${countText}</strong></div>
            <div class="unknown-count-item">未知係数<strong>3N = ${threeNText} 個</strong></div>
            <div class="unknown-count-item">条件式<strong>3N = ${threeNText} 本</strong></div>
          </div>
          <p>
            各区間の三次式を
            \\(F_{${q},k}(t)=a_{${q},k}(t-t_k)^3+b_{${q},k}(t-t_k)^2+c_{${q},k}(t-t_k)+d_{${q},k}\\)
            と置きます。始点条件 \\(F_{${q},k}(t_k)=${q}_k\\) から
            \\(d_{${q},k}=${q}_k\\) が既知になるため、解く未知数は
            \\(a_{${q},k}, b_{${q},k}, c_{${q},k}\\) の3種類だけです。
          </p>
          <p>
            位置条件 N 本、1階周期条件 N 本、2階周期条件 N 本を合わせると、
            未知数 ${threeNText} 個に対して条件式 ${threeNText} 本がそろい、行列方程式として解けます。
          </p>`;
      }
      if (step2Desc) step2Desc.innerHTML = `第 k 区間では、参考記事の式に合わせて次の三次式を置きます。`;
      if (step2Formula) step2Formula.innerHTML = `
        $$ F_{${q},k}(t)=a_{${q},k}(t-t_k)^3+b_{${q},k}(t-t_k)^2+c_{${q},k}(t-t_k)+d_{${q},k} $$
        $$ F_{${q},k}(t_k)=${q}_k=d_{${q},k} $$
      `;
      if (step2Note) step2Note.innerHTML = `
        定数項 \\(d_{${q},k}\\) は入力点 \\(${q}_k\\) として既知です。
        そのため、行列方程式で解く未知数は各区間の
        \\(a_{${q},k}, b_{${q},k}, c_{${q},k}\\) だけになります。
      `;
      if (step2ValuesHead) step2ValuesHead.textContent = '実際の値（既知の定数項 d）';
      if (step3Intro) step3Intro.innerHTML = `
        STEP2で \\(d_{${q},k}\\) が既知になったため、残る
        \\(3N\\) 個の未知係数を、以下の \\(3N\\) 本の条件式から求めます。
      `;
      if (derivation) {
        derivation.style.display = 'block';
        derivation.innerHTML = this._closedDerivationHtml(q, n);
      }
      if (positionFormula) positionFormula.innerHTML = `\\(a_{${q},k}h^3 + b_{${q},k}h^2 + c_{${q},k}h = ${q}_{k+1} - ${q}_k\\)`;
      if (firstFormula) firstFormula.innerHTML = `\\(3a_{${q},k}h^2 + 2b_{${q},k}h + c_{${q},k} - c_{${q},k+1} = 0\\)`;
      if (secondFormula) secondFormula.innerHTML = `\\(3a_{${q},k}h + b_{${q},k} - b_{${q},k+1} = 0\\)`;
      if (boundaryFormula) boundaryFormula.innerHTML = `\\(\\text{閉曲線では自然境界条件を使わず、周期条件で閉じます}\\)`;
      if (step1Desc) step1Desc.innerHTML = `閉曲線補間では、表示成分 <strong>${label}</strong> の点列 ${q}<sub>k</sub> を共通パラメータ t 上で周期的に補間します。`;
      if (step1Formula) step1Formula.innerHTML = `$$ h = \\frac{1}{N}, \\quad t_k = kh \\quad (k = 0, 1, \\ldots, N)${n > 0 ? `, \\quad N=${n}, \\quad h=${this._fmtNum(result.details.h)}` : ''} $$`;
      if (step1Note) step1Note.innerHTML = `区間 k では局所パラメータ \\(localH = t - t_k\\) を使い、\\(${label}\\) の補間式を組み立てます。最後の区間は先頭点へ戻ります。`;
      return;
    }

    if (step1Title) step1Title.innerHTML = 'STEP 1　区間幅 Δh<sub>k</sub> の計算';
    if (step2Title) step2Title.innerHTML = 'STEP 2　区間内の 3 次補間式';
    if (step2Desc) step2Desc.innerHTML = `第 k 区間の補間式（\\(d_k = y_k\\) は既知）：`;
    if (step2Formula) step2Formula.innerHTML = `$$ S_k(h) = a_k h^3 + b_k h^2 + c_k h + d_k $$`;
    if (step2Note) step2Note.innerHTML = `未知係数は各区間につき <strong>a<sub>k</sub>, b<sub>k</sub>, c<sub>k</sub></strong> の 3 つ。
            N−1 区間合計で <strong>3(N−1)</strong> 個の未知数となります。`;
    if (step2ValuesHead) step2ValuesHead.textContent = '実際の値（各区間の係数）';
    if (step3Intro) step3Intro.innerHTML = '3(N−1) 個の未知数を求めるため、以下の条件から同数の方程式を立てます：';
    if (derivation) {
      derivation.style.display = 'none';
      derivation.innerHTML = '';
    }
    if (summary) {
      summary.style.display = 'none';
      summary.innerHTML = '';
    }
    if (positionFormula) positionFormula.innerHTML = `\\(a_k + b_k + c_k = y_{k+1} - y_k\\)`;
    if (firstFormula) firstFormula.innerHTML = `\\(\\dfrac{3a_k+2b_k+c_k}{\\Delta h_k} = \\dfrac{c_{k+1}}{\\Delta h_{k+1}}\\)`;
    if (secondFormula) secondFormula.innerHTML = `\\(\\dfrac{6a_k+2b_k}{\\Delta h_k^2} = \\dfrac{2b_{k+1}}{\\Delta h_{k+1}^2}\\)`;
    if (boundaryFormula) boundaryFormula.innerHTML = `\\(b_0 = 0,\\quad \\dfrac{6a_{N-2}+2b_{N-2}}{\\Delta h_{N-2}^2} = 0\\)`;
    if (step1Desc) step1Desc.innerHTML = `隣り合う入力点の X 座標（またはパラメータ t）の差を<strong>区間幅</strong>と呼びます：`;
    if (step1Formula) step1Formula.innerHTML = `$$ \\Delta h_k = x_{k+1} - x_k \\quad (k = 0, 1, \\ldots, N-2) $$`;
    if (step1Note) step1Note.innerHTML = `各区間の補間式は、この Δh<sub>k</sub> で正規化されたパラメータ
              \\(h = \\dfrac{x - x_k}{\\Delta h_k}\\)（\\(0 \\le h \\le 1\\)）で書かれます。
              h = 0 が始点 \\(x_k\\)、h = 1 が終点 \\(x_{k+1}\\) です。`;
  }

  _conditionRowClass(row, n, mode) {
    if (mode !== 'closed') return '';
    if (row < n) return 'row-condition-position';
    if (row < 2 * n) {
      return row === 2 * n - 1 ? 'row-condition-first-loop' : 'row-condition-first';
    }
    return row === 3 * n - 1 ? 'row-condition-second-loop' : 'row-condition-second';
  }

  _conditionLegendHtml() {
    return `
      <div class="condition-legend">
        <span><i class="legend-position"></i>位置条件</span>
        <span><i class="legend-first"></i>1階周期条件</span>
        <span><i class="legend-first-loop"></i>1階周期条件（最後→最初）</span>
        <span><i class="legend-second"></i>2階周期条件</span>
        <span><i class="legend-second-loop"></i>2階周期条件（最後→最初）</span>
      </div>`;
  }

  openCalculationDetail(encodedDetail) {
    if (!encodedDetail) return;
    let detail;
    try {
      detail = JSON.parse(decodeURIComponent(encodedDetail));
    } catch (error) {
      return;
    }

    const modal = document.getElementById('calcDetailModal');
    const titleEl = document.getElementById('calcDetailTitle');
    const bodyEl = document.getElementById('calcDetailBody');
    if (!modal || !titleEl || !bodyEl) return;

    titleEl.textContent = detail.title || '計算詳細';
    const rows = Array.isArray(detail.rows) ? detail.rows : [];
    bodyEl.innerHTML = `
      <dl>
        ${rows.map(row => `
          <dt>${this._escapeHtml(row[0])}</dt>
          <dd>${this._escapeHtml(row[1])}</dd>
        `).join('')}
      </dl>
      <div class="detail-note">表内の下線付きセルをクリックすると、このように値の出どころを確認できます。</div>
    `;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  closeCalculationDetail() {
    const modal = document.getElementById('calcDetailModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  _escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  _escapeAttr(value) {
    return this._escapeHtml(value);
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
    const showOriginalPoints = document.getElementById('showOriginalPoints')?.checked !== false;
    const showInterpolatedLine = document.getElementById('showInterpolatedLine')?.checked !== false;
    const showInterpolatedPoints = document.getElementById('showInterpolatedPoints')?.checked !== false;
    const showOriginalLabels = document.getElementById('showOriginalLabels')?.checked === true;

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

    const datasets = [];
    if (showOriginalPoints) {
      datasets.push({
        label: '元の点群',
        data: originalData,
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.7)',
        pointRadius: 6,
        pointHoverRadius: 8,
        showLine: false,
        pointKind: 'original'
      });
    }
    datasets.push({
      label: '補間曲線',
      data: interpolatedData,
      borderColor: 'rgb(54, 162, 235)',
      backgroundColor: 'rgba(54, 162, 235, 0)',
      pointRadius: showInterpolatedPoints ? 2 : 0,
      pointHoverRadius: showInterpolatedPoints ? 4 : 0,
      showLine: showInterpolatedLine,
      borderWidth: 2,
      tension: 0,
      pointKind: 'interpolated'
    });

    const originalLabelPlugin = {
      id: 'originalPointLabels',
      afterDatasetsDraw(chart) {
        if (!showOriginalLabels || !showOriginalPoints) return;
        const originalDatasetIndex = chart.data.datasets.findIndex(ds => ds.pointKind === 'original');
        if (originalDatasetIndex < 0) return;
        const meta = chart.getDatasetMeta(originalDatasetIndex);
        const { ctx: chartCtx } = chart;
        chartCtx.save();
        chartCtx.font = '12px "Segoe UI", sans-serif';
        chartCtx.fillStyle = '#444';
        chartCtx.strokeStyle = 'rgba(255,255,255,0.85)';
        chartCtx.lineWidth = 3;
        meta.data.forEach((element, index) => {
          const point = originalData[index];
          const label = `(${Number(point.x).toFixed(2)}, ${Number(point.y).toFixed(2)})`;
          const x = element.x + 8;
          const y = element.y - 8;
          chartCtx.strokeText(label, x, y);
          chartCtx.fillText(label, x, y);
        });
        chartCtx.restore();
      }
    };

    // Chart.js チャート作成
    window.currentChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1,
        plugins: {
          legend: { position: 'top' },
          title: {
            display: true,
            text: `スプライン補間（${this._modeLabel(result.mode)}）`
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
      },
      plugins: [originalLabelPlugin]
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
   * 補間結果をCSVファイルとしてダウンロード
   */
  saveCsv() {
    const outputTextarea = document.getElementById('outputPoints');
    if (!outputTextarea || !outputTextarea.value.trim()) {
      alert('保存するデータがありません。先に「実行」してください。');
      return;
    }

    // ヘッダー行を付けてCSV文字列を作成
    const header = 'x,y\n';
    const csvContent = header + outputTextarea.value.trim();

    // ファイル名：モードと日時を含める
    const mode = this.currentMode === 'normal' ? 'normal' : (this.currentMode === 'closed' ? 'closed' : 'parametric');
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const fileName = `spline_${mode}_${ts}.csv`;

    // Blob経由でダウンロード
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
        ${this._referenceLinkHtml('https://www.softex-celware.com/post/spline-excelvba', '三次スプライン補間の導出及び Excel VBA での実装')}
      `;
    } else if (this.currentMode === 'closed') {
      modeDesc.innerHTML = `
        <strong>閉曲線補間</strong><br>
        入力点列を閉じた輪郭として扱い、最終点から先頭点へ戻る区間も含めて周期条件で補間します。
        ${this._referenceLinkHtml('https://www.softex-celware.com/post/closed-spline-interpolation-excel-vba', '閉曲線のスプライン補間｜数式導出からExcel VBAで実装まで')}
      `;
    } else {
      modeDesc.innerHTML = `
        <strong>パラメトリック補間</strong><br>
        X = x(t), Y = y(t) の形で補間します。ループ状の曲線や X が単調増加でない場合に対応します。
        ${this._referenceLinkHtml('https://www.softex-celware.com/post/spline-excelvba', '三次スプライン補間の導出及び Excel VBA での実装')}
      `;
    }
    this.updateConditionCards(this.currentMode);
    this.updateClosedLearningText(this.currentMode, this.currentComponent, this.currentResult);
    this.rerenderMath();
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

  _modeLabel(mode) {
    if (mode === 'normal') return '通常補間';
    if (mode === 'closed') return '閉曲線補間';
    return 'パラメトリック補間';
  }

  _referenceLinkHtml(url, label) {
    return `
      <div class="mode-reference-link">
        参考記事:
        <a href="${url}" target="_blank" rel="noopener">${label}</a>
      </div>`;
  }

  rerenderMath() {
    const learningSection = document.getElementById('learningSection');
    if (window.MathJax && learningSection) {
      MathJax.typesetPromise([learningSection]).catch(err => console.log(err));
    }
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
    this.updateComponentSelector(null);
    this.updateConditionCards(null);

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
