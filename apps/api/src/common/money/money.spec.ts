import {
  toMinorUnits,
  fromMinorUnits,
  calculateCommission,
  calculateNet,
} from './money';

describe('money utilities', () => {
  it('converts major to minor units', () => {
    expect(toMinorUnits(2000)).toBe(200000n);
    expect(toMinorUnits('2.5')).toBe(250n);
  });

  it('converts minor to major units', () => {
    expect(fromMinorUnits(200000n)).toBe(2000);
    expect(fromMinorUnits(250n)).toBe(2.5);
  });

  it('computes commission using basis points', () => {
    // 10% of 200000 cents = 20000
    expect(calculateCommission(200000n, 1000)).toBe(20000n);
    // 8.5% of 200000 = 17000
    expect(calculateCommission(200000n, 850)).toBe(17000n);
  });

  it('computes net earnings', () => {
    // gross 200000 - commission 20000 - fee 500 = 179500
    expect(calculateNet(200000n, 20000n, 500n)).toBe(179500n);
  });
});
