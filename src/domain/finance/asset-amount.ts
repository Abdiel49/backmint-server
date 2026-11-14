declare const assetAmountBrand: unique symbol;

export type AssetAmount = Readonly<{
  assetId: string;
  units: string & { readonly [assetAmountBrand]: true };
}>;

const INTEGER_UNITS = /^(0|[1-9][0-9]*)$/;

export function createAssetAmount(
  assetId: string,
  units: string,
): AssetAmount {
  if (!assetId.trim()) {
    throw new TypeError('assetId is required');
  }
  if (!INTEGER_UNITS.test(units)) {
    throw new TypeError('Asset amount must use a canonical non-negative integer string');
  }

  return Object.freeze({
    assetId,
    units: units as AssetAmount['units'],
  });
}

function assertSameAsset(left: AssetAmount, right: AssetAmount): void {
  if (left.assetId !== right.assetId) {
    throw new TypeError('Asset amounts must use the same asset');
  }
}

export function addAssetAmounts(
  left: AssetAmount,
  right: AssetAmount,
): AssetAmount {
  assertSameAsset(left, right);

  return createAssetAmount(
    left.assetId,
    (BigInt(left.units) + BigInt(right.units)).toString(),
  );
}

export function subtractAssetAmounts(
  left: AssetAmount,
  right: AssetAmount,
): AssetAmount {
  assertSameAsset(left, right);
  const difference = BigInt(left.units) - BigInt(right.units);

  if (difference < 0n) {
    throw new RangeError('Asset amount cannot become negative');
  }

  return createAssetAmount(left.assetId, difference.toString());
}

export function compareAssetAmounts(
  left: AssetAmount,
  right: AssetAmount,
): -1 | 0 | 1 {
  assertSameAsset(left, right);
  const leftUnits = BigInt(left.units);
  const rightUnits = BigInt(right.units);

  return leftUnits < rightUnits ? -1 : leftUnits > rightUnits ? 1 : 0;
}

export function isPositiveAssetAmount(amount: AssetAmount): boolean {
  return BigInt(amount.units) > 0n;
}

export function formatAssetAmount(
  amount: AssetAmount,
  decimals: number,
): string {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new RangeError('Asset decimals must be an integer between 0 and 255');
  }

  const units = BigInt(amount.units);
  if (decimals === 0) {
    return units.toString();
  }

  const padded = units.toString().padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, '');

  return fraction ? `${whole}.${fraction}` : whole;
}
