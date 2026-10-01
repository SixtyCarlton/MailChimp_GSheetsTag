# Changelog

All notable changes to Mailchimp Sheets Tagger are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- **Major** (2.0.0): changes that require users to re-run Setup or change their sheet
- **Minor** (1.1.0): new features that work with existing sheets
- **Patch** (1.0.1): bug fixes

## [Unreleased]

## [1.0.0] - 2026-10-01

First public release.

### Added

- **Mailchimp menu** in Google Sheets with Test connection, Clear all filters, Refresh member data, Tag visible rows, and Setup.
- **Setup wizard** that connects a sheet to Mailchimp in three prompt boxes: API key (validated before saving), audience selection, and field selection. It creates the Settings and Keywords tabs.
- **Settings tab** listing every Mailchimp field and signup-form group, with *Include* and *Scan for keywords* checkboxes, plus a *Tag only subscribed contacts* option. Re-running Setup keeps existing choices and adds new Mailchimp fields.
- **Refresh member data** loads every contact (all statuses except archived) into a Members tab with a Status column, reporting progress in the corner message box.
- **Safe refresh**: data loads into a temporary tab and replaces the Members tab only when complete, so a failed refresh leaves existing data untouched.
- **Address fields** shown as City, State, Zip, and Country columns. Street lines are left out to limit personal data in the sheet.
- **Keyword standardization** from an optional Keywords tab (Category, Keyword, Aliases): case-insensitive whole-word matching across selected free-text fields and signup-form groups, a *Keywords (standardized)* column, and one checkbox column per keyword, colored by category.
- **Tag visible rows** tags contacts visible after filtering or hiding rows, in batches of 500, with the option to add to an existing tag. Non-subscribed contacts are skipped by default and counted.
- **Mailchimp log tab** recording each tagging run: time, user, tag, counts, and any addresses that couldn't be tagged.
- **Clear all filters** removes all filter conditions and shows hidden rows.
- **Automatic retry** when Mailchimp rate-limits requests.
- `appsscript.json` manifest declaring the Google Sheets advanced service and the script's permissions.
- README, MIT license, and security policy.

[Unreleased]: https://github.com/SixtyCarlton/MailChimp_GSheetsTag/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/SixtyCarlton/MailChimp_GSheetsTag/releases/tag/v1.0.0
