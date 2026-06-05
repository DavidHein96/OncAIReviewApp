# Running OncAI Review on a Mac

This app isn't from the Mac App Store and isn't signed by Apple, so macOS asks
you to approve it **once**. After that it opens normally with a double-click.

> **Which file?** Use `oncai-review-<version>-macos-arm64.zip`. This is for
> **Apple Silicon** Macs (M1/M2/M3/M4 — any Mac from 2020 onward). To check:
> → menu → **About This Mac**; under **Chip** it should say "Apple ...".
> (If it says "Intel", let the sender know — you need a different build.)

## First time (one-time approval)

1. **Download** `oncai-review-<version>-macos-arm64.zip`.
2. **Double-click the `.zip`** in your Downloads to unzip it. You'll get
   **`oncai-review`** (a small app with a rocket-style icon).
3. **Double-click `oncai-review`.** macOS will pop up a message like
   _"Apple could not verify 'oncai-review' is free of malware."_ Click
   **Done** (do **not** click "Move to Trash").
4. Open **System Settings** ( menu → System Settings).
5. Go to **Privacy & Security**, then scroll down to the **Security** section.
   You'll see a line: _"oncai-review" was blocked to protect your Mac._
   Click **Open Anyway**.
6. Confirm with **Touch ID** or your Mac password, then click **Open** in the
   final dialog.
7. Your web browser opens with the review app. If macOS asks whether the app can
   access your **Documents** folder, click **Allow** — that's where your reviews
   are saved (`Documents/oncai_reviews/`).

That's it. **You only do steps 3–6 once.**

## Every time after that

- Double-click **`oncai-review`** — your browser opens with the app.
- In the app, click **Open a review package** and choose the
  `.review_pkg.json` file you were sent.
- **To quit:** right-click (or Control-click) the app's icon in the **Dock** and
  choose **Quit**. (Closing the browser tab alone doesn't stop it.)

## Troubleshooting

- **"Open Anyway" isn't showing** in Privacy & Security — try double-clicking the
  app once first; the button only appears right after macOS blocks it.
- **Browser didn't open** — the app prints a `http://127.0.0.1:...` address; you
  can paste that into Safari/Chrome manually.
- **Still stuck?** Send a screenshot of what you see to the person who shared the
  app with you.
