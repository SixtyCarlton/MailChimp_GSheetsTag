/**
 * Mailchimp Tagger for Google Sheets (generic version)
 *
 * Works with any Mailchimp account. Adds a "Mailchimp" menu that lets a team:
 *   1. Load their Mailchimp audience into a "Members" tab
 *   2. Filter it to the contacts they want (any field, plus standardized keywords)
 *   3. Tag the visible contacts in Mailchimp, ready to send a campaign to the tag
 *
 * Setup (admin, once): paste this script into Extensions > Apps Script, save,
 * reload the sheet, and choose Mailchimp > Setup…. The wizard asks for an API
 * key and audience and creates the Settings and Keywords tabs. No code editing
 * is needed after that.
 *
 * Tabs created:
 *   Settings       audience, options, and which fields appear as columns
 *   Keywords       optional keyword list for standardization
 *   Members        the audience data (rebuilt on every refresh)
 *   Mailchimp log  record of every tagging run
 */

const SHEETS = {
  SETTINGS: 'Settings',
  KEYWORDS: 'Keywords',
  MEMBERS: 'Members',
  LOG: 'Mailchimp log',
  TEMP: 'Members (loading)',
};
const PAGE_SIZE = 1000;     // Mailchimp maximum per member read
const CHUNK_SIZE = 500;     // Mailchimp maximum per tag request
const CATEGORY_PALETTE = ['#e8f0fe', '#e6f4ea', '#fef7e0', '#fce8e6', '#f3e8fd', '#e4f7fb'];
const OTHER_COLOR = '#f1f3f4';

// Address parts shown as columns. Street lines are left out on purpose to
// keep less personal data in the sheet.
const ADDRESS_PARTS = [['city', 'City'], ['state', 'State'], ['zip', 'Zip'], ['country', 'Country']];

// ================================================================ menu

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Mailchimp')
    .addItem('Test connection', 'testConnection')
    .addItem('Clear all filters', 'clearFilters')
    .addSeparator()
    .addItem('— Mailchimp Integration Options —', 'showHelp')   // menus have no headers; this shows a quick guide
    .addItem('1. Refresh member data', 'refreshMembers')
    .addItem('2. Tag visible rows…', 'tagVisibleRows')
    .addSeparator()
    .addItem('Setup… (admin)', 'runSetup')
    .addToUi();
}

function showHelp() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('Mailchimp Integration Options',
    '1. Refresh member data: loads the latest contacts from Mailchimp into the Members tab.\n\n' +
    '2. Filter the Members tab with the buttons in the header row ' +
    '(Clear all filters starts over).\n\n' +
    '3. Tag visible rows: tags every contact still visible, so you can send them a campaign in Mailchimp.\n\n' +
    'First time? An admin needs to run Mailchimp > Setup… once.',
    ui.ButtonSet.OK);
}

// ================================================================ setup wizard

function runSetup() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();

  const go = ui.alert('Mailchimp setup',
    'This connects the sheet to Mailchimp in three steps:\n\n' +
    '1. Enter a Mailchimp API key\n2. Choose an audience\n3. Choose which fields to show\n\n' +
    'The API key is stored with this spreadsheet. Anyone with edit access can see it, ' +
    'so keep edit access limited to the people who build lists.\n\nContinue?',
    ui.ButtonSet.OK_CANCEL);
  if (go !== ui.Button.OK) return;

  // ---- Step 1: API key
  let key = props.getProperty('MAILCHIMP_API_KEY');
  if (key) {
    const keep = ui.alert('Step 1 of 3: API key',
      `An API key ending in …${key.slice(-8)} is already saved.\n\nKeep using it?`,
      ui.ButtonSet.YES_NO_CANCEL);
    if (keep === ui.Button.CANCEL || keep === ui.Button.CLOSE) return;
    if (keep === ui.Button.NO) key = null;
  }
  if (!key) {
    const r = ui.prompt('Step 1 of 3: API key',
      'Paste a Mailchimp API key.\n\n' +
      'To create one in Mailchimp: profile picture > Profile > Extras > API keys > Create A Key.\n' +
      'It looks like 1a2b3c…-us21 (include the part after the dash).',
      ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    key = r.getResponseText().trim();
    if (!/^[0-9a-f]{32}-[a-z]{2}\d+$/i.test(key)) {
      ui.alert('That doesn\'t look like a Mailchimp API key. Setup stopped; run it again when you have the key.');
      return;
    }
    try {
      mc_('get', '/ping', null, key);
    } catch (e) {
      ui.alert(`Mailchimp didn't accept that key:\n\n${e.message}\n\nSetup stopped.`);
      return;
    }
    props.setProperty('MAILCHIMP_API_KEY', key);
  }

  // ---- Step 2: audience
  const lists = mc_('get', '/lists?count=1000&fields=lists.id,lists.name,lists.stats.member_count').lists || [];
  if (!lists.length) {
    ui.alert('No audiences were found in this Mailchimp account. Create one in Mailchimp, then run Setup again.');
    return;
  }
  let list = lists[0];
  if (lists.length === 1) {
    ui.alert('Step 2 of 3: Audience', `Using your audience "${list.name}".`, ui.ButtonSet.OK);
  } else {
    const menu = lists.map((l, i) => `${i + 1}. ${l.name} (${l.stats.member_count} subscribed)`).join('\n');
    const r = ui.prompt('Step 2 of 3: Audience',
      `Which audience should this sheet use? Enter its number:\n\n${menu}`, ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    const n = parseInt(r.getResponseText(), 10);
    if (!(n >= 1 && n <= lists.length)) {
      ui.alert('Please enter one of the numbers shown. Setup stopped; run it again.');
      return;
    }
    list = lists[n - 1];
  }

  // ---- Step 3: fields
  const mergeFields = (mc_('get', `/lists/${list.id}/merge-fields?count=1000` +
      '&fields=merge_fields.tag,merge_fields.name,merge_fields.type,merge_fields.display_order')
      .merge_fields || []).sort((a, b) => a.display_order - b.display_order);
  const categories = mc_('get', `/lists/${list.id}/interest-categories?count=100` +
      '&fields=categories.id,categories.title').categories || [];

  writeSettings_(list, mergeFields, categories);
  ensureKeywordsSheet_();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SETTINGS).activate();

  ui.alert('Step 3 of 3: Fields',
    'Setup is complete. The Settings tab is now open.\n\n' +
    '• Untick "Include" for any field you don\'t want as a column.\n' +
    '• Tick "Scan for keywords" for fields to match against the Keywords list (e.g. skills or interests).\n' +
    '• Optionally, list keywords and their alternative spellings on the Keywords tab.\n\n' +
    'Then choose Mailchimp > 1. Refresh member data.',
    ui.ButtonSet.OK);
}

/** Create or rebuild the Settings tab, keeping earlier choices for fields that still exist. */
function writeSettings_(list, mergeFields, categories) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.SETTINGS);

  // Remember previous choices
  const previous = {};
  let subscribedOnly = true;
  if (sheet) {
    try {
      const cfg = readSettings_();
      cfg.fields.forEach(f => { previous[f.key] = f; });
      subscribedOnly = cfg.subscribedOnly;
    } catch (e) { /* unreadable; start fresh */ }
    sheet.clear();
    sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => p.remove());
  } else {
    sheet = ss.insertSheet(SHEETS.SETTINGS);
  }

  const rows = [];
  mergeFields.forEach(f => {
    const p = previous[f.tag];
    rows.push([p ? p.include : true, f.name, f.tag, f.type, p ? p.scan : false]);
  });
  categories.forEach(c => {
    const key = `group:${c.id}`;
    const p = previous[key];
    rows.push([p ? p.include : true, c.title, key, 'group', p ? p.scan : false]);
  });

  sheet.getRange('A1').setValue('Mailchimp settings').setFontSize(14).setFontWeight('bold');
  sheet.getRange('A2').setValue('Created by Mailchimp > Setup…. Change the choices below at any time; ' +
    'run Setup again to change the audience or API key, or to pick up new Mailchimp fields.')
    .setFontColor('#5f6368');
  sheet.getRange('A4:B7').setValues([
    ['Audience ID', list.id],
    ['Audience name', list.name],
    ['Tag only subscribed contacts', subscribedOnly],
    ['Last setup', `${new Date().toLocaleString()} by ${Session.getActiveUser().getEmail()}`],
  ]);
  sheet.getRange('B6').insertCheckboxes();
  sheet.getRange('A4:A7').setFontWeight('bold');

  sheet.getRange('A9:E9')
    .setValues([['Include', 'Field', 'Mailchimp tag', 'Type', 'Scan for keywords']])
    .setFontWeight('bold').setBackground('#e8eaed');
  if (rows.length) {
    sheet.getRange(10, 1, rows.length, 5).setValues(rows);
    sheet.getRange(10, 1, rows.length, 1).insertCheckboxes();
    sheet.getRange(10, 5, rows.length, 1).insertCheckboxes();
  }
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 260);
  sheet.autoResizeColumns(3, 3);

  // Warn (don't block) anyone editing the fixed parts
  sheet.protect().setWarningOnly(true)
    .setDescription('Mailchimp settings: change via Setup, except the checkboxes.');
}

/** Create the Keywords tab with instructions and two example rows, if it doesn't exist. */
function ensureKeywordsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(SHEETS.KEYWORDS)) return;
  const sheet = ss.insertSheet(SHEETS.KEYWORDS);
  sheet.getRange('A1:C1').setValues([['Category', 'Keyword', 'Aliases (comma-separated)']])
    .setFontWeight('bold').setBackground('#e8eaed');
  sheet.getRange('A2:C3').setValues([
    ['Example category', 'Example keyword', 'example, sample, demo'],
    ['Example category', 'Another keyword', 'another, alternate spelling'],
  ]);
  sheet.getRange('E1').setValue('How this works').setFontWeight('bold');
  sheet.getRange('E2:E6').setValues([
    ['Each row is one keyword. Replace the examples with your own.'],
    ['A contact gets a keyword if its name or any alias appears in a field ticked "Scan for keywords".'],
    ['Matching ignores capitals and whole words only ("r" won\'t match "carrots").'],
    ['Each keyword becomes a checkbox column on the Members tab, colored by category.'],
    ['Leave this tab empty to turn keyword standardization off. Changes apply on the next refresh.'],
  ]);
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 320);
}

// ================================================================ settings

/** Read the Settings tab. Returns {listId, listName, subscribedOnly, fields:[...]}. */
function readSettings_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SETTINGS);
  if (!sheet) throw new Error('There is no Settings tab.');
  const values = sheet.getDataRange().getValues();
  const kv = {};
  let header = -1;
  for (let i = 0; i < values.length; i++) {
    const label = String(values[i][0]).trim();
    if (label === 'Include') { header = i; break; }
    if (label) kv[label] = values[i][1];
  }
  const fields = header < 0 ? [] : values.slice(header + 1)
    .filter(r => String(r[2]).trim())
    .map(r => ({
      include: r[0] === true,
      label: String(r[1]).trim(),
      key: String(r[2]).trim(),
      type: String(r[3]).trim(),
      scan: r[4] === true,
    }));
  return {
    listId: String(kv['Audience ID'] || '').trim(),
    listName: String(kv['Audience name'] || '').trim(),
    subscribedOnly: kv['Tag only subscribed contacts'] !== false,
    fields: fields,
  };
}

/** Settings if setup is complete; otherwise tells the user and returns null. */
function requireSetup_() {
  const hasKey = !!PropertiesService.getScriptProperties().getProperty('MAILCHIMP_API_KEY');
  let cfg = null;
  try { cfg = readSettings_(); } catch (e) { /* not set up */ }
  if (!hasKey || !cfg || !cfg.listId) {
    SpreadsheetApp.getUi().alert('This sheet isn\'t connected to Mailchimp yet. ' +
      'An admin needs to run Mailchimp > Setup… first.');
    return null;
  }
  return cfg;
}

/** Keywords tab rows: [{category, name, aliases[]}]. Empty if the tab is missing or blank. */
function readKeywords_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.KEYWORDS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues()
    .filter(r => String(r[1]).trim())
    .map(r => {
      const name = String(r[1]).trim();
      const aliases = String(r[2]).split(/[,;]/).map(a => a.trim().toLowerCase()).filter(Boolean);
      return { category: String(r[0]).trim(), name: name, aliases: [name.toLowerCase()].concat(aliases) };
    });
}

// ================================================================ actions

function testConnection() {
  const cfg = requireSetup_();
  if (!cfg) return;
  const list = mc_('get', `/lists/${cfg.listId}?fields=name,stats.member_count`);
  SpreadsheetApp.getUi().alert(
    `Connected to "${list.name}" (${list.stats.member_count} subscribed contacts).`);
}

/**
 * Rebuild the Members tab from Mailchimp, reporting progress in the corner
 * message box. Rows go to a temporary tab that replaces Members only when
 * every page has loaded, so a failed refresh leaves the old data in place.
 */
function refreshMembers() {
  const cfg = requireSetup_();
  if (!cfg) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    ss.toast('Connecting to Mailchimp…', 'Mailchimp', -1);
    const keywords = readKeywords_();
    const groupIds = cfg.fields
      .filter(f => f.type === 'group' && (f.include || f.scan))
      .map(f => f.key.replace('group:', ''));
    const groups = getGroups_(cfg.listId, groupIds);
    const layout = buildColumns_(cfg, groups, keywords);
    const columns = layout.columns;

    // Temporary tab with header
    const old = ss.getSheetByName(SHEETS.TEMP);
    if (old) ss.deleteSheet(old);
    const temp = ss.insertSheet(SHEETS.TEMP);
    temp.getRange(1, 1, 1, columns.length)
      .setValues([columns.map(c => c[0])]).setFontWeight('bold');
    if (layout.keywordCount) {
      temp.getRange(1, columns.length - layout.keywordCount + 1, 1, layout.keywordCount)
        .setBackgrounds([layout.keywordColors]);
    }

    // Load every page (all statuses except archived)
    const total = mc_('get', `/lists/${cfg.listId}/members?count=1&fields=total_items`).total_items;
    const textCols = columns.length - layout.keywordCount;
    let row = 2;
    for (let offset = 0; offset < total; offset += PAGE_SIZE) {
      const res = mc_('get', `/lists/${cfg.listId}/members?count=${PAGE_SIZE}&offset=${offset}` +
        '&fields=members.email_address,members.status,members.merge_fields,members.tags,' +
        'members.timestamp_opt,members.timestamp_signup,members.interests');
      const rows = (res.members || []).map(m => columns.map(c => c[1](m)));
      if (rows.length) {
        temp.getRange(row, 1, rows.length, textCols).setNumberFormat('@');   // keep zip codes etc. as text
        temp.getRange(row, 1, rows.length, columns.length).setValues(rows);
        row += rows.length;
      }
      ss.toast(`Read ${row - 2} of ${total} contacts…`, 'Mailchimp', -1);
      if (!rows.length) break;
    }
    const count = row - 2;

    // Swap in the new tab
    const current = ss.getSheetByName(SHEETS.MEMBERS);
    if (current) ss.deleteSheet(current);
    temp.setName(SHEETS.MEMBERS);
    ss.setActiveSheet(temp);
    temp.setFrozenRows(1);
    if (count && layout.keywordCount) {
      temp.getRange(2, columns.length - layout.keywordCount + 1, count, layout.keywordCount).insertCheckboxes();
    }
    temp.getRange(1, 1, count + 1, columns.length).createFilter();
    temp.getRange('A1').setNote(`Refreshed from Mailchimp ${new Date().toLocaleString()} ` +
                                `by ${Session.getActiveUser().getEmail()}`);

    ss.toast(`${count} contacts loaded. Use the filter buttons in the header row, ` +
             'then Mailchimp > Tag visible rows.', 'Mailchimp', 10);
  } catch (e) {
    const temp = ss.getSheetByName(SHEETS.TEMP);
    if (temp) ss.deleteSheet(temp);
    ss.toast('', 'Mailchimp', 1);
    SpreadsheetApp.getUi().alert(`Refresh failed: ${e.message}\n\nThe existing Members tab was not changed.`);
  }
}

/** Remove all filter conditions and un-hide rows on the Members tab. Sorting is left as is. */
function clearFilters() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.MEMBERS);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('There is no Members tab yet. Run Mailchimp > 1. Refresh member data first.');
    return;
  }
  const filter = sheet.getFilter();
  if (filter) {
    const range = filter.getRange();
    for (let col = range.getColumn(); col <= range.getLastColumn(); col++) {
      if (filter.getColumnFilterCriteria(col)) filter.removeColumnFilterCriteria(col);
    }
  } else if (sheet.getLastRow() > 0) {
    sheet.getDataRange().createFilter();
  }
  if (sheet.getMaxRows() > 1) sheet.showRows(1, sheet.getMaxRows());
  ss.setActiveSheet(sheet);
  ss.toast(`All filters cleared. All ${Math.max(sheet.getLastRow() - 1, 0)} contacts are visible.`,
           'Mailchimp', 5);
}

function tagVisibleRows() {
  const cfg = requireSetup_();
  if (!cfg) return;
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.MEMBERS);
  if (!sheet) {
    ui.alert('There is no Members tab yet. Run Mailchimp > 1. Refresh member data first.');
    return;
  }
  sheet.activate();

  const { emails, invalid, notSubscribed } = getVisibleEmails_(sheet, cfg.subscribedOnly);
  if (!emails.length) {
    ui.alert(notSubscribed
      ? `None of the visible contacts are subscribed (${notSubscribed} not subscribed). Nothing to tag.`
      : 'No email addresses found in the visible rows.');
    return;
  }

  // 1. Tag name
  const skippedNote = notSubscribed
    ? `\n(${notSubscribed} visible contacts aren't subscribed and will be skipped.)` : '';
  const resp = ui.prompt('Tag visible rows',
    `${emails.length} contacts will be tagged.${skippedNote}\n\n` +
    'Tag name (start with the date, e.g. 2026-10 Newsletter follow-up):',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const tagName = resp.getResponseText().trim();
  if (!tagName || tagName.length > 100) {
    ui.alert('Tag name must be 1–100 characters. Nothing was changed.');
    return;
  }

  // 2. Confirm
  const existing = findTag_(cfg.listId, tagName);
  const question = existing
    ? `Tag "${tagName}" already exists with ${existing.member_count} contacts.\n\nAdd these ${emails.length} contacts to it?`
    : `Create tag "${tagName}" and add ${emails.length} contacts?`;
  if (ui.alert('Confirm', question, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const tagId = existing
    ? existing.id
    : mc_('post', `/lists/${cfg.listId}/segments`, { name: tagName, static_segment: [] }).id;

  // 3. Add in batches
  let added = 0;
  const notAdded = [];
  for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
    const res = mc_('post', `/lists/${cfg.listId}/segments/${tagId}`,
                    { members_to_add: emails.slice(i, i + CHUNK_SIZE) });
    added += res.total_added || 0;
    (res.errors || []).forEach(e =>
      (e.email_addresses || []).forEach(addr => notAdded.push([addr, e.error])));
  }
  invalid.forEach(addr => notAdded.push([addr, 'Not a valid email address; skipped']));

  // 4. Log and report
  writeLog_(tagName, added, notAdded, notSubscribed);
  ui.alert('Done',
    `Tag: ${tagName}\n\nTagged: ${added}\nNot tagged: ${notAdded.length}` +
    (notAdded.length ? ` (details on the "${SHEETS.LOG}" tab)` : '') +
    (notSubscribed ? `\nSkipped (not subscribed): ${notSubscribed}` : '') +
    '\n\nIn Mailchimp, choose this tag as the recipients when creating a campaign. ' +
    'The Tags column updates on the next refresh.',
    ui.ButtonSet.OK);
}

// ================================================================ columns and keywords

/**
 * Members tab columns, as [header, value function]. Returns
 * {columns, keywordCount, keywordColors}; keyword checkbox columns are always last.
 */
function buildColumns_(cfg, groups, keywords) {
  const cols = [['Email Address', m => m.email_address], ['Status', m => m.status]];
  const included = cfg.fields.filter(f => f.include);
  const addressCount = included.filter(f => f.type === 'address').length;

  included.forEach(f => {
    if (f.type === 'group') {
      const g = groups[f.key];
      if (g) cols.push([f.label, m => selectedOptions_(m, g).join(', ')]);
    } else if (f.type === 'address') {
      ADDRESS_PARTS.forEach(([part, name]) =>
        cols.push([addressCount > 1 ? `${f.label} ${name}` : name, m => addressPart_(m, f.key, part)]));
    } else {
      cols.push([f.label, m => fieldText_(m, f.key)]);
    }
  });
  cols.push(['Tags', m => (m.tags || []).map(t => t.name).join(', ')]);
  cols.push(['Opt-in Date', m => (m.timestamp_opt || m.timestamp_signup || '').slice(0, 10)]);

  // Keywords: only if there's something to standardize
  const textKeys = cfg.fields.filter(f => f.scan && f.type !== 'group' && f.type !== 'address').map(f => f.key);
  const scanGroups = cfg.fields.filter(f => f.scan && f.type === 'group').map(f => groups[f.key]).filter(Boolean);
  if (!keywords.length && !scanGroups.length) return { columns: cols, keywordCount: 0, keywordColors: [] };

  const ctx = { keywords: keywords, textKeys: textKeys, scanGroups: scanGroups, regex: new Map() };
  const names = keywordColumnNames_(ctx);
  cols.push(['Keywords (standardized)', m => [...keywordSet_(m, ctx)].sort().join(', ')]);
  names.forEach(name => cols.push([name, m => keywordSet_(m, ctx).has(name)]));

  const categories = [...new Set(keywords.map(s => s.category))];
  const colorOf = {};
  keywords.forEach(s => {
    colorOf[s.name] = CATEGORY_PALETTE[categories.indexOf(s.category) % CATEGORY_PALETTE.length];
  });
  return { columns: cols, keywordCount: names.length, keywordColors: names.map(n => colorOf[n] || OTHER_COLOR) };
}

/** Keyword column names: every listed keyword, then any scanned-group option that matches none. */
function keywordColumnNames_(ctx) {
  const names = ctx.keywords.map(s => s.name);
  ctx.scanGroups.forEach(g => Object.values(g.interests).forEach(option => {
    const matched = ctx.keywords.some(s => keywordRegex_(s, ctx).test(option));
    if (!matched && !names.includes(option)) names.push(option);
  }));
  return names;
}

/** A contact's keywords, computed once per contact. */
function keywordSet_(m, ctx) {
  if (!m.__keywords) {
    const found = new Set();
    ctx.scanGroups.forEach(g => selectedOptions_(m, g).forEach(option => {
      const hits = ctx.keywords.filter(s => keywordRegex_(s, ctx).test(option));
      if (hits.length) hits.forEach(s => found.add(s.name));
      else found.add(option);
    }));
    const text = ctx.textKeys.map(k => fieldText_(m, k)).join(' | ');
    if (text.trim()) ctx.keywords.forEach(s => { if (keywordRegex_(s, ctx).test(text)) found.add(s.name); });
    m.__keywords = found;
  }
  return m.__keywords;
}

/** Whole-word, case-insensitive regex for a keyword's aliases (cached per refresh). */
function keywordRegex_(keyword, ctx) {
  if (!ctx.regex.has(keyword.name)) {
    const alts = keyword.aliases
      .map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'))
      .join('|');
    ctx.regex.set(keyword.name, new RegExp(`(^|[^a-z0-9])(${alts})(?=$|[^a-z0-9])`, 'i'));
  }
  return ctx.regex.get(keyword.name);
}

// ================================================================ Mailchimp data helpers

/** Groups (signup-form checkbox lists) by key "group:<id>": {title, interests:{id: name}}. */
function getGroups_(listId, categoryIds) {
  const groups = {};
  if (!categoryIds.length) return groups;
  const cats = mc_('get', `/lists/${listId}/interest-categories?count=100` +
                          '&fields=categories.id,categories.title').categories || [];
  cats.filter(c => categoryIds.includes(c.id)).forEach(c => {
    const opts = mc_('get', `/lists/${listId}/interest-categories/${c.id}/interests` +
                            '?count=100&fields=interests.id,interests.name').interests || [];
    const interests = {};
    opts.forEach(o => { interests[o.id] = o.name; });
    groups[`group:${c.id}`] = { title: c.title, interests: interests };
  });
  return groups;
}

function selectedOptions_(m, group) {
  const chosen = m.interests || {};
  return Object.keys(group.interests).filter(id => chosen[id]).map(id => group.interests[id]);
}

function fieldText_(m, tag) {
  const v = (m.merge_fields || {})[tag];
  if (v == null) return '';
  return typeof v === 'object' ? Object.values(v).filter(Boolean).join(', ') : String(v);
}

function addressPart_(m, tag, part) {
  const a = (m.merge_fields || {})[tag];
  return a && typeof a === 'object' ? String(a[part] || '') : '';
}

function findTag_(listId, name) {
  const res = mc_('get', `/lists/${listId}/segments?type=static&count=1000` +
                         '&fields=segments.id,segments.name,segments.member_count');
  return (res.segments || []).find(s => s.name === name) || null;
}

// ================================================================ sheet helpers

/** Unique emails from visible rows; optionally only subscribed contacts. */
function getVisibleEmails_(sheet, subscribedOnly) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim().toLowerCase());
  const emailCol = headers.indexOf('email address');
  const statusCol = headers.indexOf('status');
  if (emailCol === -1) throw new Error('No "Email Address" column found. Refresh member data to rebuild the Members tab.');

  const hidden = hiddenRows_(sheet, values.length);
  const emails = new Set();
  const invalid = [];
  let notSubscribed = 0;
  for (let r = 1; r < values.length; r++) {
    if (hidden[r]) continue;
    const email = String(values[r][emailCol]).trim().toLowerCase();
    if (!email) continue;
    if (subscribedOnly && statusCol !== -1 && String(values[r][statusCol]).trim() !== 'subscribed') {
      notSubscribed++;
      continue;
    }
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) emails.add(email);
    else invalid.push(email);
  }
  return { emails: [...emails], invalid: invalid, notSubscribed: notSubscribed };
}

/** Rows hidden by a filter or by hand. One call via the Sheets advanced service if enabled. */
function hiddenRows_(sheet, numRows) {
  try {
    const range = `'${sheet.getName().replace(/'/g, "''")}'!A1:A${numRows}`;
    const res = Sheets.Spreadsheets.get(sheet.getParent().getId(), {
      ranges: [range],
      fields: 'sheets.data.rowMetadata(hiddenByFilter,hiddenByUser)',
    });
    const meta = res.sheets[0].data[0].rowMetadata || [];
    const hidden = meta.map(m => !!(m.hiddenByFilter || m.hiddenByUser));
    while (hidden.length < numRows) hidden.push(false);
    return hidden;
  } catch (e) {
    const hidden = [];
    for (let r = 1; r <= numRows; r++) hidden.push(sheet.isRowHiddenByFilter(r) || sheet.isRowHiddenByUser(r));
    return hidden;
  }
}

function writeLog_(tagName, added, notAdded, notSubscribed) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let log = ss.getSheetByName(SHEETS.LOG);
  if (!log) {
    log = ss.insertSheet(SHEETS.LOG);
    log.appendRow(['Time', 'User', 'Tag', 'Email', 'Result']);
    log.getRange('A1:E1').setFontWeight('bold');
    log.setFrozenRows(1);
  }
  const time = new Date();
  const user = Session.getActiveUser().getEmail();
  const summary = `Tagged ${added}; not tagged ${notAdded.length}` +
                  (notSubscribed ? `; skipped (not subscribed) ${notSubscribed}` : '');
  const rows = [[time, user, tagName, '', summary]];
  notAdded.forEach(([addr, reason]) => rows.push([time, user, tagName, addr, reason]));
  log.getRange(log.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
}

// ================================================================ Mailchimp API

/** Call the Mailchimp Marketing API v3, retrying if rate-limited. */
function mc_(method, path, body, keyOverride) {
  const key = keyOverride || PropertiesService.getScriptProperties().getProperty('MAILCHIMP_API_KEY');
  if (!key || key.indexOf('-') === -1) {
    throw new Error('No Mailchimp API key is set up. An admin needs to run Mailchimp > Setup….');
  }
  const dc = key.split('-').pop();
  const options = {
    method: method,
    contentType: 'application/json',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode('apikey:' + key) },
    muteHttpExceptions: true,
  };
  if (body) options.payload = JSON.stringify(body);

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = UrlFetchApp.fetch(`https://${dc}.api.mailchimp.com/3.0${path}`, options);
    const code = res.getResponseCode();
    if (code === 429 && attempt < 2) {
      Utilities.sleep(5000 * Math.pow(2, attempt));   // rate-limited: wait 5s, then 10s
      continue;
    }
    const text = res.getContentText();
    const data = text ? JSON.parse(text) : {};
    if (code >= 300) throw new Error(`Mailchimp error ${code}: ${data.detail || data.title || text}`);
    return data;
  }
}
