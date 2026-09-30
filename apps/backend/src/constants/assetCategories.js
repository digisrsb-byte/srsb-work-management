export const ASSET_CATEGORIES = [
  'Laptop',
  'Mobile Phone',
  'Employee ID Card',
  'Keyboard and Mouse',
  'Headset',
  'Laptop Charger and Accessories',
  'Office Access Card',
  'Monitor',
  'SIM Card'
];

export function isValidAssetCategory(category) {
  return ASSET_CATEGORIES.includes(String(category || '').trim());
}
