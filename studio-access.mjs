const editors = new Set([
  'ntankov@unipu.hr',
  'ilorencin@unipu.hr',
  'lblaskovi@unipu.hr',
  'mmilicevi@unipu.hr',
]);

export function isStudioEditor(payload) {
  return payload.email_verified === true && editors.has(payload.email) && payload.hd === 'unipu.hr';
}
