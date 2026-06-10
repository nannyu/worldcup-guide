function impliedProbability(decimalOdds) {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return null;
  return Math.round((1 / decimalOdds) * 100);
}

function expectedValue(decimalOdds, hitRatePercent, stake) {
  if (
    !Number.isFinite(decimalOdds)
    || !Number.isFinite(hitRatePercent)
    || !Number.isFinite(stake)
    || decimalOdds <= 1
    || hitRatePercent < 0
    || hitRatePercent > 100
    || stake <= 0
  ) {
    return null;
  }
  const winProfit = stake * (decimalOdds - 1);
  const hitRate = hitRatePercent / 100;
  return Math.round(winProfit * hitRate - stake * (1 - hitRate));
}

const checks = [
  {
    name: "decimal odds 2.00 -> 50%",
    ok: impliedProbability(2) === 50,
  },
  {
    name: "decimal odds 4.00 -> 25%",
    ok: impliedProbability(4) === 25,
  },
  {
    name: "invalid odds rejected",
    ok: impliedProbability(1) === null,
  },
  {
    name: "EV formula keeps stake loss on misses",
    ok: expectedValue(2, 60, 100) === 20,
  },
  {
    name: "invalid hit rate rejected",
    ok: expectedValue(2, 101, 100) === null,
  },
];

console.log(JSON.stringify({ ok: checks.every((check) => check.ok), checks }, null, 2));

if (checks.some((check) => !check.ok)) {
  process.exitCode = 1;
}
