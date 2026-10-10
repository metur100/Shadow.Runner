# Twinshade – store release kit

Everything needed to publish on **Google Play** and the **Apple App Store**.

```
mobile/                         Expo app (SDK 57) that runs the game in a WebView – fully offline
  app.json / eas.json           app identity, icons, splash, build + submit profiles
  credentials.json              Android upload-key config  (NOT in git – back it up!)
  credentials/android/*.jks     Android upload keystore    (NOT in git – back it up!)
store/
  listing/google-play.md        all Play Console texts + Data safety / content rating / app content answers
  listing/app-store.md          all App Store Connect texts + App Privacy / age rating / review notes
  privacy-policy.html           copy of the privacy policy (the live one is on the website, see section 0)
  graphics/                     Play icon 512, feature graphic 1024×500, header images, App Store icon 1024
  screenshots/<device>/         captioned store screenshots (8 per device size)
  screenshots/raw/<device>/     the same moments without captions
  builds/                       the signed .aab (NOT in git)
  tools/                        scripts that regenerate screenshots and graphics
```

| Identity | Value |
| --- | --- |
| App name | Twinshade (store name "Twinshade: Two Worlds Runner") |
| Android package / iOS bundle ID | `com.certidevelopment.shadowrunner` |
| Version | 1.0.0 (Android versionCode 4, iOS buildNumber 4) |
| Expo project | `@certi-development/shadow-runner` (ID `9b1c9adc-0803-4024-a167-b37429a1d734`) |

---

## Why the game is called Twinshade

Google Play rejected the first submission, named "Shadow Runner", under the **Impersonation policy**. That name is too close to existing trademarked titles (the *Shadowrun* series and other games called "Shadow Runner"). The game was renamed **Twinshade** everywhere players see the name:

- the launcher label;
- the in-game logo, loading screen and settings;
- the store graphics;
- the store listings;
- the website.

The package ID `com.certidevelopment.shadowrunner` and the Expo slug stay the same. Players never see them, and the package ID can't change after the first upload.

**Resubmitting on Google Play:**

1. In **Main store listing**, change the app name to *Twinshade: Two Worlds Runner* in **every** language listing, including en-GB, which the rejection named.
2. Paste the new descriptions and upload the new feature graphic.
3. Upload the versionCode 4 AAB.
4. Send the changes for review from **Publishing overview**.

## 0. Website, privacy policy and support URL

The website lives in the separate repo [Shadow.Runner.Landing](https://github.com/metur100/Shadow.Runner.Landing), hosted on GitHub Pages:

| Field | URL |
| --- | --- |
| Privacy policy (Play + App Store) | https://metur100.github.io/Shadow.Runner.Landing/privacy.html |
| Support URL (App Store) | https://metur100.github.io/Shadow.Runner.Landing/#support |
| Website / Marketing URL | https://metur100.github.io/Shadow.Runner.Landing/ |

## 1. Android – Google Play

### Build the AAB

```bash
npm run build:mobile      # game → mobile/src/gameHtml.ts (only needed after game changes)
cd mobile
eas build -p android --profile production
```

The AAB is signed with the upload key from `credentials.json` (local credentials).

The 1.0.0 (4) bundle (renamed to Twinshade) is in `store/builds/twinshade-1.0.0-4.aab`.

### First upload (must be done by hand once)

1. **Create the app.** In Play Console, choose **Create app**:
   - name: *Twinshade: Two Worlds Runner*
   - default language: English (US)
   - type: **Game**
   - price: **Free**
   - accept the declarations
2. **App signing.** Keep the default **Play App Signing**. Your keystore is the *upload key*; Google holds the app signing key.
3. **Listing and policies.** Fill in everything in **Policy → App content** and **Store presence** from `store/listing/google-play.md`.
4. **Test release.** Go to **Testing → Internal testing** (or Closed testing) and create a release:
   1. Upload the `.aab`.
   2. Add the release notes from the listing file.
   3. Choose Review, then Roll out.

   *New personal developer accounts* must run a **closed test with at least 12 testers for 14 days** before Google grants Production access. Organisation accounts can go to Production directly.
5. **Production.** Under **Production**, create a release, promote the same build and send it for review.

Before every new upload, raise `android.versionCode` (and `version`) in `mobile/app.json`.

## 2. iOS – App Store (built and uploaded with Expo, no Mac needed)

You need a paid **Apple Developer Program** membership.

```bash
cd mobile
eas build -p ios --profile production
npx eas-cli@latest submit -p ios --latest
```

**First build:**

- EAS asks you to log in with your Apple ID.
- It then creates the **distribution certificate**, the **provisioning profile** and the bundle ID `com.certidevelopment.shadowrunner`, and stores them on Expo's servers. Answer *Yes* when it offers to generate them.

**Submitting:**

- `submit` uploads the `.ipa` to **App Store Connect / TestFlight**.
- If the app record doesn't exist yet, EAS Submit creates it and asks for the app name and language.
- To build and upload in one step, use `eas build -p ios --profile production --auto-submit`.

Then, in **App Store Connect**:

1. Open the app and fill in **App Information**, **Pricing** and **App Privacy** from `store/listing/app-store.md`.
2. In version 1.0, upload the screenshots (6.9" iPhone and 13" iPad are required), then add the description, keywords, support URL and review notes.
3. Select the build. It appears about 10–30 minutes after upload, once processing finishes. Then choose **Add for Review** and **Submit**.

Before every new upload, raise `ios.buildNumber` (and `version` for a new store version) in `mobile/app.json`.

## 3. Checklist

**Google Play**
- [ ] Privacy policy URL
- [ ] App icon 512 × 512 – `graphics/play-store-icon-512.png`
- [ ] Feature graphic 1024 × 500 – `graphics/play-feature-graphic-1024x500.png`
- [ ] Phone screenshots – `screenshots/android-phone/`
- [ ] 7" tablet screenshots – `screenshots/android-tablet-7/`
- [ ] 10" tablet screenshots – `screenshots/android-tablet-10/`
- [ ] Short and full description
- [ ] Category Arcade, contact e-mail
- [ ] Content rating (IARC) questionnaire
- [ ] Target audience
- [ ] Ads = No
- [ ] Data safety = no data collected
- [ ] App access = no login
- [ ] AAB uploaded to a testing track, then to production

**App Store**
- [ ] Privacy policy URL + support URL
- [ ] iPhone 6.9" screenshots – `screenshots/ios-iphone-6.9/`
- [ ] iPad 13" screenshots – `screenshots/ios-ipad-13/`
- [ ] (optional) iPhone 6.3" / 6.5" – `screenshots/ios-iphone-6.3/`, `screenshots/ios-iphone-6.5/`
- [ ] Name, subtitle, promotional text, description, keywords
- [ ] Category Games → Action / Casual
- [ ] Age rating 4+
- [ ] Copyright
- [ ] App Privacy → Data Not Collected
- [ ] Review notes, contact details
- [ ] Build uploaded with EAS and selected for the version

## 4. Regenerating assets

```bash
npm run build:mobile                           # game → mobile/src/gameHtml.ts
node store/tools/capture-screenshots.mjs       # raw screenshots for every device size (needs Microsoft Edge)
node store/tools/render-graphics.mjs           # icons, splash, feature graphic, header, captioned screenshots
```

The screenshots show real runs: the auto-player plays each level up to the chosen moment, then the run is frozen and captured.

## 5. Keep these safe

The **Android upload keystore** (`mobile/credentials/android/shadow-runner-upload.jks`) and its password (in `mobile/credentials.json`) are deliberately not committed to git. Store copies in a password manager or another secure backup. If the upload key is lost, it can be reset through Play Console support (Play App Signing), but that takes days.
