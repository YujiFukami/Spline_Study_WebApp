/**
 * test.js
 * スプライン補間エンジンの簡単なテスト
 * Node.js で実行: node test.js
 */

// SplineInterpolationEngine をロード
const SplineInterpolationEngine = require('./js/spline-engine.js');

console.log('==============================================');
console.log('スプライン補間エンジン テスト');
console.log('==============================================\n');

// テストケース1: 通常補間（簡単な例）
console.log('【テストケース1】通常補間 - 4点のサンプルデータ');
console.log('-----------------------------------------------');

const xArr1 = [0, 1, 2, 3];
const yArr1 = [0, 2, 1, 3];
const divNum1 = 5;

try {
  const result1 = SplineInterpolationEngine.normalSplineInterpolation(xArr1, yArr1, divNum1);

  console.log(`入力点数: ${result1.originalPoints.length}`);
  console.log(`出力点数: ${result1.interpolated.length}`);
  console.log(`区間数: ${result1.details.n}`);
  console.log(`分割数: ${result1.details.divNum}`);
  console.log(`モード: ${result1.mode}`);

  console.log('\n元の点群:');
  result1.originalPoints.forEach((p, i) => {
    console.log(`  点${i}: (${p.x}, ${p.y})`);
  });

  console.log('\n補間後の点群（最初の10点）:');
  result1.interpolated.slice(0, 10).forEach((p, i) => {
    console.log(`  点${i}: (${p.x.toFixed(4)}, ${p.y.toFixed(4)})`);
  });

  console.log('\n区間幅 (Δh):');
  result1.intervals.forEach((h, i) => {
    console.log(`  h[${i}] = ${h.toFixed(6)}`);
  });

  console.log('\n各区間の係数（a, b, c）:');
  for (let k = 0; k < result1.details.n; k++) {
    const a = result1.coefficients[3 * k][0];
    const b = result1.coefficients[3 * k + 1][0];
    const c = result1.coefficients[3 * k + 2][0];
    console.log(`  k=${k}: a=${a.toFixed(8)}, b=${b.toFixed(8)}, c=${c.toFixed(6)}`);
  }

  console.log('\n✓ テストケース1成功\n');
} catch (error) {
  console.log(`✗ エラー: ${error.message}\n`);
}

// テストケース2: パラメトリック補間
console.log('【テストケース2】パラメトリック補間 - ループ状曲線');
console.log('-----------------------------------------------');

// 単位円の一部（パラメトリック表現）
const xArr2 = [1, 0.707, 0, -0.707, -1, -0.707, 0, 0.707];
const yArr2 = [0, 0.707, 1, 0.707, 0, -0.707, -1, -0.707];
const divNum2 = 5;

try {
  const result2 = SplineInterpolationEngine.parametricSplineInterpolation(xArr2, yArr2, divNum2, 'uniform');

  console.log(`入力点数: ${result2.originalPoints.length}`);
  console.log(`出力点数: ${result2.interpolated.length}`);
  console.log(`区間数: ${result2.details.n}`);
  console.log(`パラメータ方式: ${result2.paramMode}`);
  console.log(`モード: ${result2.mode}`);

  console.log('\n元の点群:');
  result2.originalPoints.forEach((p, i) => {
    console.log(`  点${i}: (${p.x.toFixed(4)}, ${p.y.toFixed(4)})`);
  });

  console.log('\n補間後の点群（最初の10点）:');
  result2.interpolated.slice(0, 10).forEach((p, i) => {
    console.log(`  点${i}: (${p.x.toFixed(4)}, ${p.y.toFixed(4)})`);
  });

  console.log('\nパラメータ t:');
  result2.parameters.forEach((t, i) => {
    console.log(`  t[${i}] = ${t.toFixed(2)}`);
  });

  console.log('\n✓ テストケース2成功\n');
} catch (error) {
  console.log(`✗ エラー: ${error.message}\n`);
}

// テストケース3: エッジケース（3点）
console.log('【テストケース3】最小点数（3点）での補間');
console.log('-----------------------------------------------');

const xArr3 = [0, 1, 2];
const yArr3 = [0, 1, 0];
const divNum3 = 3;

try {
  const result3 = SplineInterpolationEngine.normalSplineInterpolation(xArr3, yArr3, divNum3);

  console.log(`入力点数: ${result3.originalPoints.length}`);
  console.log(`出力点数: ${result3.interpolated.length}`);

  console.log('\n補間後の点群:');
  result3.interpolated.forEach((p, i) => {
    console.log(`  点${i}: (${p.x.toFixed(4)}, ${p.y.toFixed(4)})`);
  });

  console.log('\n✓ テストケース3成功\n');
} catch (error) {
  console.log(`✗ エラー: ${error.message}\n`);
}

// テストケース4: 閉曲線補間
console.log('【テストケース4】閉曲線補間 - 周期条件');
console.log('-----------------------------------------------');

const xArr4 = [3, 2, 0, -2, -3, -1, 1];
const yArr4 = [0, 2, 3, 2, 0, -2, -2];
const outputPointCount4 = 29;

try {
  const result4 = SplineInterpolationEngine.closedSplineInterpolation(xArr4, yArr4, outputPointCount4);
  const first = result4.interpolated[0];
  const last = result4.interpolated[result4.interpolated.length - 1];
  const closedError = Math.hypot(first.x - last.x, first.y - last.y);

  console.log(`入力点数: ${result4.originalPoints.length}`);
  console.log(`出力点数: ${result4.interpolated.length}`);
  console.log(`区間数: ${result4.details.n}`);
  console.log(`行列サイズ: ${result4.matrix.length} x ${result4.matrix[0].length}`);
  console.log(`始終点誤差: ${closedError.toExponential(3)}`);

  if (result4.matrix.length !== 3 * xArr4.length) {
    throw new Error('閉曲線の行列サイズが 3N になっていません');
  }
  if (result4.interpolated.length !== outputPointCount4) {
    throw new Error('閉曲線の出力点数が指定値と一致していません');
  }
  if (closedError > 1e-10) {
    throw new Error('閉曲線の始点と終点が一致していません');
  }

  console.log('\n補間後の点群（最初の10点）:');
  result4.interpolated.slice(0, 10).forEach((p, i) => {
    console.log(`  点${i}: (${p.x.toFixed(4)}, ${p.y.toFixed(4)})`);
  });

  console.log('\n✓ テストケース4成功\n');
} catch (error) {
  console.log(`✗ エラー: ${error.message}\n`);
}

console.log('==============================================');
console.log('すべてのテストが完了しました');
console.log('==============================================');
