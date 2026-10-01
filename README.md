# Mailchimp Sheets Tagger

Filter your Mailchimp audience in Google Sheets and turn the results into a Mailchimp tag, ready to send a campaign.

Mailchimp Sheets Tagger is a Google Apps Script that adds a **Mailchimp** menu to any Google Sheet. It pulls your Mailchimp audience into the sheet, lets your team filter it with ordinary spreadsheet filters (by location, any custom field, or standardized skills and interests), and then tags the filtered contacts in Mailchimp with one click. Anyone creating a campaign in Mailchimp can then send it to that tag.

It was built for teams that need targeted lists often but don't want a more advanced Mailchimp's segment builder or juggle CSV exports and imports, such as volunteer organizations, member associations, and nonprofits.

> **Not affiliated with or endorsed by Intuit Mailchimp.** Mailchimp is a trademark of Intuit Inc.

---

## Features

- **Setup wizard.** An admin connects the sheet to Mailchimp in three prompt boxes: API key, audience, fields. No code editing.
- **Live audience data.** One click loads every contact (subscribed, unsubscribed, cleaned, pending) with a Status column.
- **Choose your columns.** A Settings tab lists every Mailchimp field and signup-form checkbox group; tick the ones you want in the sheet.
- **Keyword standardization.** List keywords and their alternative spellings in a Keyword tab. The tool scans free-text and checkbox fields and adds a tidy *Keywords (standardized)* column plus one checkbox column per keyword, so "Google Sheets", "GSheets", and "Google Docs" all count as the same keyword.
- **Tag what you see.** Filter or hide rows, then tag every visible contact. Tags are added in batches of 500, existing tags can be reused, and every run is logged.
- **Subscribed-only tagging (default).** Unsubscribed and bounced contacts are skipped, so tag counts match what Mailchimp shows when you send a campaign.
- **Safe refresh.** Data loads into a temporary tab that replaces the old one only when complete, so a failed refresh never leaves you with a half-empty sheet.
- **Clear all filters** resets the sheet for a new search.
- **Nothing to host.** Runs entirely inside Google Sheets and talks directly to the Mailchimp API.

## How it works

```
Mailchimp audience ──► 1. Refresh ──► Members tab ──► 2. Filter ──► 3. Tag visible rows ──► Mailchimp tag ──► Campaign
```

The tool only ever **reads** contact data and **adds tags**. It never creates contacts, edits contact details, or changes subscription status.

## Requirements

- A Google account with Google Sheets (personal or Google Workspace)
- A Mailchimp account with at least one audience
- A Mailchimp API key (created by an account admin; see below)

## Installation

### 1. Add the script to a sheet

1. Create a new Google Sheet.
2. Go to **Extensions → Apps Script**.
3. Delete the sample code in `Code.gs` and paste in the contents of [`Mailchimp_Tagger.gs`](Mailchimp_Tagger.gs).
4. Click **Save**. Optionally rename the project (top left) to *Mailchimp Tagger*.

### 2. Enable the Google Sheets API service (recommended)

In the Apps Script editor, click **Services +**, choose **Google Sheets API**, and click **Add**.

This lets the tool read which rows are hidden in a single call. Without it, tagging still works but checks rows one at a time, which is slow on large sheets.

### 3. Run the setup wizard

1. Go back to the sheet and reload the page. A **Mailchimp** menu appears next to **Help**.
2. Choose **Mailchimp → Setup… (admin)**.
3. Google asks you to authorize the script. If you see *Google hasn't verified this app*, click **Advanced → Go to Mailchimp Tagger**. This is normal for a script you've added yourself.
4. Follow the three steps:
   - **API key:** in Mailchimp, go to *Profile → Extras → API keys → Create A Key*, then paste it. The wizard checks it with Mailchimp before saving.
   - **Audience:** chosen automatically if you have one; otherwise pick from a numbered list.
   - **Fields:** the wizard creates the **Settings** and **Skills** tabs.

### 4. Configure

- On the **Settings** tab, untick **Include** for fields you don't want as columns, and tick **Scan for skills** for fields where people describe their skills or interests.
- Optionally fill in the **Keywords** tab (see [Keywords](#keywords)).
- Run **Mailchimp → 1. Refresh member data**.

## Usage

| Menu item | What it does |
|---|---|
| **Test connection** | Confirms the sheet can reach your audience |
| **Clear all filters** | Removes every filter and shows hidden rows |
| **— Mailchimp Integration Options —** | Shows a quick how-to |
| **1. Refresh member data** | Loads the latest contacts into the Members tab |
| **2. Tag visible rows…** | Tags every visible contact in Mailchimp |
| **Setup… (admin)** | Connects or reconfigures the sheet |

**A typical run:**

1. **Refresh member data.** Progress appears in the bottom-right corner.
2. **Clear all filters**, then filter the Members tab with the buttons in the header row. For example, *Country* = `US` and the *Python* skill column = `TRUE`. Right-click → **Hide row** to leave out individuals.
3. **Tag visible rows**, and enter a tag name. Starting with the date keeps tags organized, e.g. `2026-10 Python volunteers`.
4. In Mailchimp, create a campaign and choose the tag under **Segment or Tag**.

Contacts Mailchimp can't match are listed on the **Mailchimp log** tab, along with who ran each tagging job and when.

## Settings

The **Settings** tab is created by the setup wizard.

| Setting | Description |
|---|---|
| Audience ID / Audience name | The connected audience. Run Setup again to change it. |
| Tag only subscribed contacts | On by default. Untick to tag every visible contact regardless of status. |
| Field table | One row per Mailchimp field and signup-form group: **Include** adds it as a column; **Scan for skills** includes it in skill matching. |

Running Setup again keeps your existing choices and adds any new Mailchimp fields.

**Address fields** appear as City, State, Zip, and Country columns. Street lines are deliberately left out to keep less personal data in the sheet.

## Keywords

The **Keywords** tab is optional. Each row defines one skill:

| Category | Keywords | Aliases (comma-separated) |
|---|---|---|
| Software | Google Sheets | gsheets, Google Docs |
| Software | Office | Office 365, Excel, Microsoft Office |
| Development | Python | py, pandas |
| Languages | Spanish | español, espanol, castellano |

- A contact gets a keyword when its name or any alias appears in a field ticked **Scan for keywords**, or in a checkbox option they selected.
- Matching is case-insensitive and whole-word, so `r` won't match "carrots", and spaces are flexible, so "Office 365" matches "Office365".
- Checkbox options that match no skill are listed as-is, so the standardized column includes everything a contact selected.
- Each skill becomes a checkbox column, colored by category. Filter a column to `TRUE`, or sort it, to find everyone with that skill.
- Leave the tab empty to turn skill standardization off.

## Security and privacy

- **The API key is stored in the spreadsheet's script properties.** Anyone with **edit** access to the sheet can open the script editor and see it, and the key gives full access to your Mailchimp account. Limit edit access to the people who build lists, and give everyone else view access.
- **Rotate the key** (create a new one in Mailchimp, run Setup, delete the old one) when an editor leaves.
- **The Members tab contains personal data.** Keep sharing restricted and avoid link sharing.
- The script talks only to `*.api.mailchimp.com` and Google. No data is sent anywhere else.

## Limits and known behavior

- **Size:** Apps Script runs are limited to 6 minutes. A refresh handles roughly 10,000–15,000 contacts per minute, so very large audiences (well over 50,000) may need the refresh split across runs.
- **Archived contacts** aren't returned by Mailchimp and won't appear.
- **Filter views** (the sunglasses icon) aren't visible to scripts. Use the regular filter buttons.
- **Formulas referencing the Members tab** break on refresh, because the tab is replaced. Build summaries after refreshing.
- **The Tags column** reflects Mailchimp at the last refresh, not live.
- **Tag names** are limited to 100 characters by Mailchimp.

## Troubleshooting

| Problem | Fix |
|---|---|
| No Mailchimp menu | Wait a few seconds and reload. You need edit access. |
| "This sheet isn't connected to Mailchimp yet" | An admin needs to run **Setup…**. |
| `401` / `API Key Invalid` | The key was revoked. Create a new one and run **Setup…**. |
| Tag count is lower than expected | **Tag only subscribed contacts** is on; the confirmation shows how many were skipped. |
| Tag count is higher than expected | A filter isn't applied, or a filter view was used instead of the regular filter. |
| Many "not tagged" results | The data is out of date. Refresh and tag again with the same name. |

## Contributing

Issues and pull requests are welcome. Please don't include API keys, audience IDs, or real contact data in issues, screenshots, or commits.

## License

[MIT](LICENSE) © 2026 Sixty Carlton

## Acknowledgements

The concept, design, and requirements for this tool are my own. AI tools (Anthropic's Claude) assisted with code development, testing, and documentation.
