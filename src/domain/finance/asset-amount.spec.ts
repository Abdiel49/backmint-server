import {
  addAssetAmounts,
  compareAssetAmounts,
  createAssetAmount,
  formatAssetAmount,
  isPositiveAssetAmount,
  subtractAssetAmounts,
} from './asset-amount.js';

describe('asset amounts', () => {
  it('accepts canonical integer base units only', () => {
    expect(createAssetAmount('NEAR', '900719925474099312345')).toEqual({
      assetId: 'NEAR',
      units: '900719925474099312345',
    });
    expect(() => createAssetAmount('NEAR', '1.25')).toThrow(TypeError);
    expect(() => createAssetAmount('NEAR', 1.25 as never)).toThrow(TypeError);
    expect(() => createAssetAmount('NEAR', '01')).toThrow(TypeError);
    expect(() => createAssetAmount('', '1')).toThrow(TypeError);
  });

  it('adds and subtracts without precision loss', () => {
    const amount = createAssetAmount('NEAR', '900719925474099312345');
    const small = createAssetAmount('NEAR', '7');

    expect(addAssetAmounts(amount, small).units).toBe(
      '900719925474099312352',
    );
    expect(subtractAssetAmounts(amount, small).units).toBe(
      '900719925474099312338',
    );
    expect(() =>
      subtractAssetAmounts(small, amount),
    ).toThrow(RangeError);
  });

  it('rejects arithmetic across assets', () => {
    expect(() =>
      addAssetAmounts(
        createAssetAmount('NEAR', '1'),
        createAssetAmount('USDC', '1'),
      ),
    ).toThrow('same asset');
  });

  it('compares integer units and identifies zero amounts', () => {
    expect(
      compareAssetAmounts(
        createAssetAmount('NEAR', '9'),
        createAssetAmount('NEAR', '10'),
      ),
    ).toBe(-1);
    expect(isPositiveAssetAmount(createAssetAmount('NEAR', '0'))).toBe(false);
  });

  it('formats base units without floating-point conversion', () => {
    expect(formatAssetAmount(createAssetAmount('NEAR', '1000000000000000001'), 18))
      .toBe('1.000000000000000001');
    expect(formatAssetAmount(createAssetAmount('USDC', '1250000'), 6)).toBe(
      '1.25',
    );
    expect(formatAssetAmount(createAssetAmount('XLM', '12'), 0)).toBe('12');
    expect(() =>
      formatAssetAmount(createAssetAmount('NEAR', '1'), 256),
    ).toThrow(RangeError);
  });
});
