# Security Policy

## Supported versions

Security fixes are made to the latest release only. Please update to the current version before reporting a problem.

| Version | Supported |
|---|---|
| 1.0.x | Yes |
| Earlier | No |

## Reporting a vulnerability

**Please don't report security problems in public issues, discussions, or pull requests.**

Report them privately through GitHub:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the problem, the steps to reproduce it, and its possible impact.

Never include real API keys, audience IDs, or contact data in a report. Use placeholders or redacted examples.

This is a community-supported project maintained on a best-effort basis by [Sixty Carlton](https://sixtycarlton.com). We aim to acknowledge reports within 7 days and will keep you informed while a fix is prepared. Please allow time for a fix to be released before disclosing the issue publicly.

## Security model

Mailchimp Sheets Tagger runs entirely inside the Google Sheet it's installed in. It has no server, and it sends data only between Google and the Mailchimp API (`*.api.mailchimp.com`).

**API key storage.** The Mailchimp API key is stored in the spreadsheet's **script properties**, not in the code or the sheet's cells. However, **anyone with edit access to the spreadsheet can open the Apps Script editor and read it.** A Mailchimp API key grants full access to the Mailchimp account, not only to the audience the tool uses.

**Personal data.** Refreshing copies contact data from Mailchimp into the Members tab, including email addresses, names, and any fields the admin includes. Street address lines are deliberately left out. The Mailchimp log tab records the email address of whoever runs each tagging job, plus any addresses that couldn't be tagged.

**What the tool changes in Mailchimp.** It only creates tags and adds contacts to tags. It never creates, edits, deletes, unsubscribes, or resubscribes contacts.

**Permissions.** The script requests these Google permissions, declared in `appsscript.json`:

| Permission | Purpose |
|---|---|
| `spreadsheets` | Read and write the sheet; detect hidden rows |
| `script.container.ui` | Show the menu, prompts, and alerts |
| `script.external_request` | Connect to the Mailchimp API |
| `userinfo.email` | Record who ran each job in the log |

## Recommendations for organizations using the tool

- **Limit edit access** to the people who build lists. Give everyone else view access.
- **Use a dedicated API key** for this tool, named so it's easy to identify in Mailchimp (for example, *Sheets Tagger*).
- **Rotate the key** whenever someone with edit access leaves: create a new key in Mailchimp, run **Mailchimp → Setup…**, then delete the old key.
- **Keep sharing restricted.** Don't enable "anyone with the link" access on a sheet that contains contact data.
- **Install from this repository or an official template only**, and review the code before authorizing it. Modified copies from other sources could send your API key or data elsewhere.
- **Check the script before updating.** Compare a new version against this repository before pasting it into your sheet.

## Out of scope

- Vulnerabilities in Google Apps Script, Google Sheets, or the Mailchimp API themselves. Please report those to Google or Intuit Mailchimp.
- Risks arising from sharing a sheet's edit access, or from code that has been modified outside this repository.
