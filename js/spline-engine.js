/**
 * spline-engine.js
 * スプライン補間計算エンジン（VBA実装をJavaScriptに移植）
 * 対応：通常補間、パラメトリック補間、閉曲線補間
 */

class SplineInterpolationEngine {

  /**
   * 通常スプライン補間（関数型）
   * Y = f(X)
   * @param {number[]} xArr - X座標配列（単調増加）
   * @param {number[]} yArr - Y座標配列
   * @param {number} divNum - 全体範囲の分割数（出力点数 - 1）
   * @returns {Object} { interpolated: [[x,y],...], matrix: A, vector: C, coefficients: coeff, details: {...} }
   */
  static normalSplineInterpolation(xArr, yArr, divNum) {
    const n = xArr.length - 1;  // 区間数

    // 区間幅 dH_k の計算（式(1)）
    const dH = [];
    for (let k = 0; k < n; k++) {
      let h = xArr[k + 1] - xArr[k];
      if (Math.abs(h) < 1e-15) h = 1e-15;
      dH[k] = h;
    }

    // 3n × 3n 行列 A と右辺ベクトル C を構築
    // 未知数ベクトル: B = [a_0, b_0, c_0, a_1, b_1, c_1, ..., a_{n-1}, b_{n-1}, c_{n-1}]
    // 対応関係: a_k -> 3k+1,  b_k -> 3k+2,  c_k -> 3k+3（1-indexed）

    const matA = this._createMatrix(3 * n, 3 * n);
    const vecC = this._createMatrix(3 * n, 1);

    // 行 1～n: 補間条件（式(5)）a_k + b_k + c_k = y_{k+1} - y_k
    for (let k = 0; k < n; k++) {
      const r = k;  // 0-indexed
      matA[r][3 * k] = 1;      // a_k
      matA[r][3 * k + 1] = 1;  // b_k
      matA[r][3 * k + 2] = 1;  // c_k
      vecC[r][0] = yArr[k + 1] - yArr[k];
    }

    // 行 n～2n-2: 1階導関数連続条件（式(6)）
    // (3a_k + 2b_k + c_k)/dH_k = c_{k+1}/dH_{k+1}
    for (let k = 0; k < n - 1; k++) {
      const r = n + k;
      matA[r][3 * k] = 3 / dH[k];      // a_k
      matA[r][3 * k + 1] = 2 / dH[k];  // b_k
      matA[r][3 * k + 2] = 1 / dH[k];  // c_k
      matA[r][3 * (k + 1) + 2] = -1 / dH[k + 1];  // c_{k+1}
    }

    // 行 2n-1～3n-2: 2階導関数連続条件（式(7)）
    // (6a_k + 2b_k)/dH_k^2 = 2b_{k+1}/dH_{k+1}^2
    for (let k = 0; k < n - 1; k++) {
      const r = 2 * n - 1 + k;
      matA[r][3 * k] = 6 / (dH[k] * dH[k]);      // a_k
      matA[r][3 * k + 1] = 2 / (dH[k] * dH[k]);  // b_k
      matA[r][3 * (k + 1) + 1] = -2 / (dH[k + 1] * dH[k + 1]);  // b_{k+1}
    }

    // 行 3n-1: 左端境界（自然スプライン）: b_0 = 0
    matA[3 * n - 2][1] = 2;

    // 行 3n: 右端境界（自然スプライン）: (6a_{n-1} + 2b_{n-1})/dH_{n-1}^2 = 0
    matA[3 * n - 1][3 * (n - 1)] = 6 / (dH[n - 1] * dH[n - 1]);
    matA[3 * n - 1][3 * (n - 1) + 1] = 2 / (dH[n - 1] * dH[n - 1]);

    // 連立方程式を解く: Coeff = inv(A) * C
    const matAInv = this._inverseMatrix(matA);
    const coeff = this._matrixMultiply(matAInv, vecC);

    // 補間点の計算
    const xMin = xArr[0];
    const xMax = xArr[n];
    const interpolated = [];

    for (let j = 0; j <= divNum; j++) {
      const xv = xMin + (xMax - xMin) * j / divNum;

      // xv が含まれる区間 kk を探す
      let kk = n - 1;
      for (let i = 0; i < n - 1; i++) {
        if (xv < xArr[i + 1]) {
          kk = i;
          break;
        }
      }

      // 正規化パラメータ h（式(2)）
      const hv = (xv - xArr[kk]) / dH[kk];

      // スプライン式の評価（式(3), d_k = y_k）
      const a = coeff[3 * kk][0];
      const b = coeff[3 * kk + 1][0];
      const c = coeff[3 * kk + 2][0];
      const d = yArr[kk];

      const yv = a * hv * hv * hv + b * hv * hv + c * hv + d;

      interpolated.push({ x: xv, y: yv });
    }

    return {
      mode: 'normal',
      interpolated: interpolated,
      originalPoints: xArr.map((x, i) => ({ x, y: yArr[i] })),
      matrix: matA,
      vector: vecC,
      coefficients: coeff,
      intervals: dH,
      details: {
        n: n,
        divNum: divNum,
        xMin: xMin,
        xMax: xMax,
        totalPoints: divNum + 1
      }
    };
  }

  /**
   * パラメトリック・スプライン補間
   * X = x(t), Y = y(t)
   * @param {number[]} xArr - X座標配列
   * @param {number[]} yArr - Y座標配列
   * @param {number} divNum - 全体パラメータ範囲の分割数（出力点数 - 1）
   * @param {string} paramMode - パラメータ方式 'uniform', 'chordal' (初期は uniform のみ)
   * @returns {Object} { interpolated: [[x,y],...], xEngine: {...}, yEngine: {...}, details: {...} }
   */
  static parametricSplineInterpolation(xArr, yArr, divNum, paramMode = 'uniform') {
    const n = xArr.length - 1;

    // パラメータ t の生成
    const t = [];
    if (paramMode === 'uniform') {
      // 等間隔パラメータ
      for (let i = 0; i <= n; i++) {
        t[i] = i;
      }
    } else if (paramMode === 'chordal') {
      // 弦長パラメータ
      t[0] = 0;
      for (let i = 1; i <= n; i++) {
        const dx = xArr[i] - xArr[i - 1];
        const dy = yArr[i] - yArr[i - 1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        t[i] = t[i - 1] + dist;
      }
    }

    try {
      // x(t) と y(t) をそれぞれスプライン補間
      const xEngine = this._parametricSplineCore(t, xArr, divNum);
      const yEngine = this._parametricSplineCore(t, yArr, divNum);

      // 補間点を構築
      const interpolated = [];
      for (let i = 0; i < xEngine.interpolated.length; i++) {
        interpolated.push({
          x: xEngine.interpolated[i],
          y: yEngine.interpolated[i]
        });
      }

      // t の区間幅 (パラメータ区間幅)
      const tIntervals = [];
      for (let k = 0; k < n; k++) {
        tIntervals[k] = t[k + 1] - t[k];
      }

      return {
        mode: 'parametric',
        interpolated: interpolated,
        originalPoints: xArr.map((x, i) => ({ x, y: yArr[i] })),
        parameters: t,
        intervals: tIntervals,          // ← ui-controller が参照する intervals
        matrix: xEngine.matrix,         // x(t) 側の行列（学習表示用）
        vector: xEngine.vector,
        coefficients: xEngine.coefficients,  // ← 係数（x側）
        xEngine: xEngine,
        yEngine: yEngine,
        paramMode: paramMode,
        details: {
          n: n,
          divNum: divNum,
          totalPoints: divNum + 1,
          paramMode: paramMode
        }
      };
    } catch (error) {
      throw new Error(`パラメトリック補間エラー: ${error.message}`);
    }
  }

  /**
   * 閉曲線スプライン補間
   * 入力点列を周期的に接続し、最終区間から先頭区間へ戻る条件で補間する。
   * @param {number[]} xArr - X座標配列（末尾に先頭点を重複させない）
   * @param {number[]} yArr - Y座標配列（末尾に先頭点を重複させない）
   * @param {number} outputPointCount - 補間後の出力点数
   * @returns {Object} { interpolated, xEngine, yEngine, matrix, vector, coefficients, details }
   */
  static closedSplineInterpolation(xArr, yArr, outputPointCount) {
    const n = xArr.length;
    const h = 1 / n;
    const parameters = [];
    for (let i = 0; i <= n; i++) {
      parameters[i] = i * h;
    }

    try {
      const totalDivisions = outputPointCount - 1;
      const xEngine = this._closedSplineCore(xArr, totalDivisions);
      const yEngine = this._closedSplineCore(yArr, totalDivisions);

      const interpolated = [];
      for (let i = 0; i < xEngine.interpolated.length; i++) {
        interpolated.push({
          x: xEngine.interpolated[i],
          y: yEngine.interpolated[i]
        });
      }

      return {
        mode: 'closed',
        interpolated: interpolated,
        originalPoints: xArr.map((x, i) => ({ x, y: yArr[i] })),
        parameters: parameters,
        intervals: Array(n).fill(h),
        matrix: xEngine.matrix,
        vector: xEngine.vector,
        coefficients: xEngine.coefficients,
        xEngine: xEngine,
        yEngine: yEngine,
        details: {
          n: n,
          divNum: totalDivisions,
          outputPointCount: outputPointCount,
          totalPoints: interpolated.length,
          h: h
        }
      };
    } catch (error) {
      throw new Error(`閉曲線補間エラー: ${error.message}`);
    }
  }

  /**
   * パラメトリック補間のコア処理
   * @private
   */
  static _parametricSplineCore(t, vals, divNum) {
    const n = t.length - 1;

    // 区間幅 dT_k の計算
    const dT = [];
    for (let k = 0; k < n; k++) {
      let h = t[k + 1] - t[k];
      if (Math.abs(h) < 1e-15) h = 1e-15;
      dT[k] = h;
    }

    const matA = this._createMatrix(3 * n, 3 * n);
    const vecC = this._createMatrix(3 * n, 1);

    // 補間条件
    for (let k = 0; k < n; k++) {
      const r = k;
      matA[r][3 * k] = 1;
      matA[r][3 * k + 1] = 1;
      matA[r][3 * k + 2] = 1;
      vecC[r][0] = vals[k + 1] - vals[k];
    }

    // 1階導関数連続条件
    for (let k = 0; k < n - 1; k++) {
      const r = n + k;
      matA[r][3 * k] = 3 / dT[k];
      matA[r][3 * k + 1] = 2 / dT[k];
      matA[r][3 * k + 2] = 1 / dT[k];
      matA[r][3 * (k + 1) + 2] = -1 / dT[k + 1];
    }

    // 2階導関数連続条件
    for (let k = 0; k < n - 1; k++) {
      const r = 2 * n - 1 + k;
      matA[r][3 * k] = 6 / (dT[k] * dT[k]);
      matA[r][3 * k + 1] = 2 / (dT[k] * dT[k]);
      matA[r][3 * (k + 1) + 1] = -2 / (dT[k + 1] * dT[k + 1]);
    }

    // 境界条件（自然スプライン）
    matA[3 * n - 2][1] = 2;
    matA[3 * n - 1][3 * (n - 1)] = 6 / (dT[n - 1] * dT[n - 1]);
    matA[3 * n - 1][3 * (n - 1) + 1] = 2 / (dT[n - 1] * dT[n - 1]);

    const matAInv = this._inverseMatrix(matA);
    const coeff = this._matrixMultiply(matAInv, vecC);

    // パラメータ範囲
    const tMin = t[0];
    const tMax = t[n];
    const interpolated = [];

    for (let j = 0; j <= divNum; j++) {
      const tv = tMin + (tMax - tMin) * j / divNum;

      let kk = n - 1;
      for (let i = 0; i < n - 1; i++) {
        if (tv < t[i + 1]) {
          kk = i;
          break;
        }
      }

      const hv = (tv - t[kk]) / dT[kk];
      const a = coeff[3 * kk][0];
      const b = coeff[3 * kk + 1][0];
      const c = coeff[3 * kk + 2][0];
      const d = vals[kk];

      const vv = a * hv * hv * hv + b * hv * hv + c * hv + d;
      interpolated.push(vv);
    }

    return {
      interpolated: interpolated,
      matrix: matA,
      vector: vecC,
      coefficients: coeff,
      intervals: dT
    };
  }

  /**
   * 閉曲線補間のコア処理
   * VBA の Cal__SplineClosed と同じ周期条件で 1 成分を補間する。
   * @private
   */
  static _closedSplineCore(vals, totalDivisions) {
    const n = vals.length;
    const h = 1 / n;
    const matA = this._createMatrix(3 * n, 3 * n);
    const vecX = this._createMatrix(3 * n, 1);

    // 位置条件: a_k h^3 + b_k h^2 + c_k h = v_{k+1} - v_k
    for (let k = 0; k < n; k++) {
      const r = k;
      const col = 3 * k;
      const nextK = (k + 1) % n;
      matA[r][col] = h * h * h;
      matA[r][col + 1] = h * h;
      matA[r][col + 2] = h;
      vecX[r][0] = vals[nextK] - vals[k];
    }

    // 1階連続（周期）: 3a_k h^2 + 2b_k h + c_k - c_{k+1} = 0
    for (let k = 0; k < n; k++) {
      const r = n + k;
      const col = 3 * k;
      const nextK = (k + 1) % n;
      matA[r][col] = 3 * h * h;
      matA[r][col + 1] = 2 * h;
      matA[r][col + 2] = 1;
      matA[r][3 * nextK + 2] = -1;
    }

    // 2階連続（周期）: 3a_k h + b_k - b_{k+1} = 0
    for (let k = 0; k < n; k++) {
      const r = 2 * n + k;
      const col = 3 * k;
      const nextK = (k + 1) % n;
      matA[r][col] = 3 * h;
      matA[r][col + 1] = 1;
      matA[r][3 * nextK + 1] = -1;
    }

    const matAInv = this._inverseMatrix(matA);
    const coeff = this._matrixMultiply(matAInv, vecX);
    const interpolated = [];

    for (let i = 0; i <= totalDivisions; i++) {
      if (i === totalDivisions) {
        interpolated.push(vals[0]);
        continue;
      }

      const t = i / totalDivisions;
      let seg = Math.floor(t / h);
      if (seg >= n) seg = n - 1;
      const localH = t - seg * h;
      const a = coeff[3 * seg][0];
      const b = coeff[3 * seg + 1][0];
      const c = coeff[3 * seg + 2][0];
      const d = vals[seg];

      interpolated.push(a * localH * localH * localH + b * localH * localH + c * localH + d);
    }

    return {
      interpolated: interpolated,
      matrix: matA,
      vector: vecX,
      coefficients: coeff,
      intervals: Array(n).fill(h)
    };
  }

  /**
   * ユーティリティ: 行列作成
   * @private
   */
  static _createMatrix(rows, cols) {
    const mat = [];
    for (let i = 0; i < rows; i++) {
      mat[i] = [];
      for (let j = 0; j < cols; j++) {
        mat[i][j] = 0;
      }
    }
    return mat;
  }

  /**
   * ユーティリティ: 行列の逆行列（ガウス・ジョルダン法）
   * @private
   */
  static _inverseMatrix(A) {
    const n = A.length;
    const aug = [];

    // 拡大行列 [A | I] を作成
    for (let i = 0; i < n; i++) {
      aug[i] = [];
      for (let j = 0; j < n; j++) {
        aug[i][j] = A[i][j];
      }
      for (let j = 0; j < n; j++) {
        aug[i][n + j] = i === j ? 1 : 0;
      }
    }

    // ガウス・ジョルダン消去法
    for (let i = 0; i < n; i++) {
      // ピボット探索
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
          maxRow = k;
        }
      }

      // 行交換
      [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

      // ピボットが0でないか確認
      if (Math.abs(aug[i][i]) < 1e-15) {
        throw new Error('行列が特異です（逆行列が存在しません）');
      }

      // 正規化
      const pivot = aug[i][i];
      for (let j = 0; j < 2 * n; j++) {
        aug[i][j] /= pivot;
      }

      // 消去
      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = aug[k][i];
          for (let j = 0; j < 2 * n; j++) {
            aug[k][j] -= factor * aug[i][j];
          }
        }
      }
    }

    // 逆行列部分を抽出
    const inv = [];
    for (let i = 0; i < n; i++) {
      inv[i] = [];
      for (let j = 0; j < n; j++) {
        inv[i][j] = aug[i][n + j];
      }
    }

    return inv;
  }

  /**
   * ユーティリティ: 行列乗算
   * @private
   */
  static _matrixMultiply(A, B) {
    const result = [];
    for (let i = 0; i < A.length; i++) {
      result[i] = [];
      for (let j = 0; j < B[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < B.length; k++) {
          sum += A[i][k] * B[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  }

}

// export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SplineInterpolationEngine;
}
