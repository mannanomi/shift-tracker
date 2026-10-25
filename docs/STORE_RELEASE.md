# Releasing Shiftly to the App Store and Google Play

The store apps wrap the same web app with [Capacitor](https://capacitorjs.com). App ID: `com.mannanomi.shiftly` (permanent once published — change it in `capacitor.config.ts` before the first upload if you want a different one).

## One-time setup

1. **Supabase:** run the `delete_my_account` function from `supabase/schema.sql` in the SQL Editor (the in-app "Delete my account" needs it — Apple requires account deletion).
2. **Privacy policy:** replace `CONTACT_EMAIL` in `public/privacy.html` with the address people should contact, then deploy the web app. Store URL: `https://shiftly-au.vercel.app/privacy.html`.
3. **Demo account for reviewers:** sign up in the app with an email you control (e.g. `review@…`), add a job and a few shifts. Apple and Google both need a login to test the app.
4. **Accounts:** Apple Developer Program ($99 USD/year, developer.apple.com) and Google Play Console ($25 USD once, play.google.com/console).
5. **Tools:** Xcode (installed) with the iOS platform (Xcode → Settings → Components), and [Android Studio](https://developer.android.com/studio) for the Android build.

## Every release

```bash
npm run cap:sync      # builds the web app and copies it into ios/ and android/
```

Bump the version first: Xcode → App target → General → Version/Build, and `versionCode`/`versionName` in `android/app/build.gradle`.

### iOS
1. `npm run cap:ios` opens Xcode.
2. App target → Signing & Capabilities → choose your team (automatic signing).
3. Product → Destination → Any iOS Device, then Product → Archive → Distribute App → App Store Connect.
4. In App Store Connect: create the app (bundle ID above), fill in the listing below, pick the build, submit for review.

### Android
1. `npm run cap:android` opens Android Studio.
2. Build → Generate Signed App Bundle → create an upload key (**back it up — losing it blocks future updates**) → release `.aab`.
3. In Play Console: create the app, upload the `.aab` to a **closed testing** track, add at least 12 testers (colleagues' Google accounts) and keep it running 14 days — required for new personal developer accounts before production.
4. Fill in the listing and the Data safety form below, then promote to production.

## Store listing

**Name:** Shiftly
**Subtitle (iOS, 30 chars):** Shift pay tracker for workers
**Category:** Finance (secondary: Productivity)
**Age rating:** 4+ / Everyone

**Short description (Play, 80 chars):**
Track shifts across jobs and see your pay, overtime, tax and super at a glance.

**Description:**
Shiftly works out what you've earned, shift by shift.

• Log shifts in seconds, or set up a roster (e.g. 2 days, 2 nights, 4 off) and fill months ahead automatically
• Accurate pay: night loading, Saturday, Sunday and public holiday rates, hours after midnight paid at the next day's rate
• Overtime by day, week or fortnight — including a shared limit across jobs with the same employer
• See your fortnight at a glance: earned so far, after-tax estimate, super and goals
• Cash and ABN/gig income (e.g. Uber) kept separate, with how much to set aside for tax
• Payslip check to spot underpayments
• PDF pay report with hours by base rate, night, weekend and overtime
• Works offline; syncs across your phone and computer when you sign in

Pay, tax and super are estimates from the rates you enter — always check against your payslip.

**Keywords (iOS, 100 chars):** shift,pay,roster,wages,overtime,payslip,penalty rates,security,timesheet,earnings,hours,award

**Privacy policy URL:** https://shiftly-au.vercel.app/privacy.html
**Support URL:** https://shiftly-au.vercel.app

**Review notes (iOS) / App access (Play):**
Sign in with the demo account: [EMAIL] / [PASSWORD]. Shiftly calculates estimated pay from shifts the user enters; no payments are made in the app. Account deletion: Account → Delete my account.

## Privacy answers

**Apple App Privacy:**
- Data collected: Contact Info → Email Address; User Content → Other User Content (jobs, shifts, pay figures). Both *linked to the user*, used for *App Functionality* only.
- Not used for tracking. No third-party advertising or analytics.

**Google Data safety:**
- Collected: Personal info → Email address; App activity → Other user-generated content.
- Purpose: App functionality, Account management. Not shared with third parties.
- Encrypted in transit: Yes. Users can request deletion: Yes (in the app).

## Screenshots

iPhone 6.9" (1320×2868) and 6.5" (1284×2778), and Android phone screenshots. Good screens: Dashboard, Shifts calendar with a day open, Reports breakdown, Roster setup, Add shift.
